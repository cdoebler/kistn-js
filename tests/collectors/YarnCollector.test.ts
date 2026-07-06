import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { YarnCollector } from '../../src/collectors/YarnCollector';
import { ProcessRunnerInterface, ProcessResult } from '../../src/process/ProcessRunner';

const classicDir = join(__dirname, '../fixtures/yarn-classic');
const berryDir = join(__dirname, '../fixtures/yarn-berry');

class FakeRunner implements ProcessRunnerInterface {
  public readonly capturedCwds: string[] = [];

  constructor(private readonly responses: Record<string, ProcessResult>) {}
  run(command: string, cwd: string): ProcessResult {
    this.capturedCwds.push(cwd);
    for (const [prefix, result] of Object.entries(this.responses)) {
      if (command.startsWith(prefix)) {
        return result;
      }
    }
    return { exitCode: 1, output: '' };
  }
}

describe('YarnCollector', () => {
  it('detects and parses a classic (v1) lockfile', () => {
    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({}));
    const payload = collector.collect();
    expect(payload!.packages.some((p) => p.name === 'lodash')).toBe(true);
  });

  it('detects and parses a berry (v2+) lockfile', () => {
    const collector = new YarnCollector(join(berryDir, 'yarn.lock'), join(berryDir, 'package.json'), new FakeRunner({}));
    const payload = collector.collect();
    expect(payload!.packages.some((p) => p.name === 'lodash')).toBe(true);
  });

  it('parses classic NDJSON audit output into findings', () => {
    const runner = new FakeRunner({
      'yarn --version': { exitCode: 0, output: '1.22.19' },
      'yarn audit': {
        exitCode: 1,
        output: JSON.stringify({ type: 'auditAdvisory', data: { advisory: { module_name: 'lodash', severity: 'high', url: 'https://github.com/advisories/GHSA-abcd-1234-efgh' } } }),
      },
      'yarn outdated': { exitCode: 0, output: '{}' },
    });
    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), runner);
    const payload = collector.collect();
    expect(payload!.findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.21', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'high' },
    ]);
  });

  it('parses classic NDJSON outdated output into availableVersion', () => {
    const runner = new FakeRunner({
      'yarn --version': { exitCode: 0, output: '1.22.19' },
      'yarn audit': { exitCode: 0, output: '' },
      'yarn outdated': {
        exitCode: 0,
        output: [
          JSON.stringify({ type: 'info', data: 'Color legend : ...' }),
          JSON.stringify({
            type: 'table',
            data: {
              head: ['Package', 'Current', 'Wanted', 'Latest', 'Package Type', 'URL'],
              body: [['lodash', '4.17.20', '4.17.20', '4.18.1', 'dependencies', 'https://lodash.com/']],
            },
          }),
        ].join('\n'),
      },
    });
    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), runner);
    const payload = collector.collect();
    const lodash = payload!.packages.find((p) => p.name === 'lodash');
    expect(lodash?.availableVersion).toBe('4.18.1');
  });

  it('reports lockFiles for upload', () => {
    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({
      yarn_lock: join(classicDir, 'yarn.lock'),
      package_json: join(classicDir, 'package.json'),
    });
  });

  it('omits missing files from lockFiles', () => {
    const collector = new YarnCollector('/nonexistent/yarn.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({});
  });

  it('returns null when lockfile is absent', () => {
    const collector = new YarnCollector('/nonexistent/yarn.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.collect()).toBeNull();
  });

  it('lockFileHash returns null when lockfile is absent, and a sha256 hex digest when present', () => {
    const missing = new YarnCollector('/nonexistent/yarn.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(missing.lockFileHash()).toBeNull();

    const present = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({}));
    expect(present.lockFileHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses berry npm-style audit and outdated output', () => {
    const runner = new FakeRunner({
      'yarn --version': { exitCode: 0, output: '4.1.0' },
      'yarn npm audit': {
        exitCode: 1,
        output: JSON.stringify({
          vulnerabilities: { lodash: { name: 'lodash', severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-abcd-1234-efgh' }] } },
        }),
      },
      'yarn outdated': { exitCode: 0, output: JSON.stringify({ lodash: { current: '4.17.21', latest: '4.17.22' } }) },
    });
    const collector = new YarnCollector(join(berryDir, 'yarn.lock'), join(berryDir, 'package.json'), runner);
    const payload = collector.collect();

    expect(payload!.findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.21', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'high' },
    ]);
    expect(payload!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBe('4.17.22');
  });

  it('leaves packages unchanged when berry outdated output is malformed, not an object, or missing a string latest', () => {
    const base = { 'yarn --version': { exitCode: 0, output: '' }, 'yarn npm audit': { exitCode: 0, output: '{}' } };

    const malformed = new YarnCollector(join(berryDir, 'yarn.lock'), join(berryDir, 'package.json'), new FakeRunner({
      ...base,
      'yarn outdated': { exitCode: 1, output: 'not json' },
    }));
    expect(malformed.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const nonObject = new YarnCollector(join(berryDir, 'yarn.lock'), join(berryDir, 'package.json'), new FakeRunner({
      ...base,
      'yarn outdated': { exitCode: 0, output: 'null' },
    }));
    expect(nonObject.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const noLatest = new YarnCollector(join(berryDir, 'yarn.lock'), join(berryDir, 'package.json'), new FakeRunner({
      ...base,
      'yarn outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21' } }) },
    }));
    expect(noLatest.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('leaves packages unchanged when classic outdated output has no table line or an unrecognized table shape', () => {
    const noTable = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({
      'yarn --version': { exitCode: 0, output: '' },
      'yarn audit': { exitCode: 0, output: '' },
      'yarn outdated': { exitCode: 0, output: '\nnot json\n' + JSON.stringify({ type: 'info', data: 'x' }) },
    }));
    expect(noTable.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const missingColumns = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({
      'yarn --version': { exitCode: 0, output: '' },
      'yarn audit': { exitCode: 0, output: '' },
      'yarn outdated': {
        exitCode: 0,
        output: JSON.stringify({ type: 'table', data: { head: ['Current', 'Wanted'], body: [] } }),
      },
    }));
    expect(missingColumns.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('skips outdated table rows with the wrong shape and packages with no matching row', () => {
    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), new FakeRunner({
      'yarn --version': { exitCode: 0, output: '' },
      'yarn audit': { exitCode: 0, output: '' },
      'yarn outdated': {
        exitCode: 0,
        output: JSON.stringify({
          type: 'table',
          data: { head: ['Package', 'Latest'], body: ['not-an-array', ['lodash', 42], ['typescript', '5.5.0']] },
        }),
      },
    }));
    const payload = collector.collect();
    expect(payload!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
    expect(payload!.packages.find((p) => p.name === 'typescript')?.availableVersion).toBe('5.5.0');
  });

  it('runs yarn commands in the lockfile directory, not process.cwd()', () => {
    const runner = new FakeRunner({
      'yarn --version': { exitCode: 0, output: '1.22.19' },
      'yarn audit': { exitCode: 0, output: '' },
      'yarn outdated': { exitCode: 0, output: '{}' },
    });

    const collector = new YarnCollector(join(classicDir, 'yarn.lock'), join(classicDir, 'package.json'), runner);
    collector.collect();
    collector.isToolAvailable();

    expect(runner.capturedCwds.length).toBeGreaterThan(0);
    for (const cwd of runner.capturedCwds) {
      expect(cwd).toBe(classicDir);
      expect(cwd).not.toBe(process.cwd());
    }
  });
});
