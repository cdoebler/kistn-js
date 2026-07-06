import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { NpmCollector } from '../../src/collectors/NpmCollector';
import { ProcessRunnerInterface, ProcessResult } from '../../src/process/ProcessRunner';

const fixtureDir = join(__dirname, '../fixtures/npm');

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

describe('NpmCollector', () => {
  it('collects packages, audit findings, and outdated versions', () => {
    const runner = new FakeRunner({
      'npm --version': { exitCode: 0, output: '10.5.0' },
      'npm audit': {
        exitCode: 1,
        output: JSON.stringify({
          vulnerabilities: { lodash: { name: 'lodash', severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-abcd-1234-efgh' }] } },
        }),
      },
      'npm outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21', latest: '4.17.22' } }) },
    });

    const collector = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), runner);
    const payload = collector.collect();

    expect(payload).not.toBeNull();
    const lodash = payload!.packages.find((p) => p.name === 'lodash');
    expect(lodash?.availableVersion).toBe('4.17.22');
    expect(payload!.findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.21', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'high' },
    ]);
  });

  it('forwards private packages from the parser onto the payload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npm-private-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@acme/widget': '^1.0.0' } }));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      packages: {
        '': { dependencies: { '@acme/widget': '^1.0.0' } },
        'node_modules/@acme/widget': {
          version: '1.0.0',
          resolved: 'https://npm.corp.example/@acme/widget/-/widget-1.0.0.tgz',
        },
      },
    }));

    const runner = new FakeRunner({
      'npm audit': { exitCode: 0, output: JSON.stringify({ vulnerabilities: {} }) },
      'npm outdated': { exitCode: 0, output: '{}' },
    });
    const payload = new NpmCollector(join(dir, 'package-lock.json'), join(dir, 'package.json'), runner).collect();
    expect(payload!.privatePackages).toEqual(['@acme/widget']);
  });

  it('returns null when lockfile is absent', () => {
    const collector = new NpmCollector('/nonexistent/package-lock.json', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.collect()).toBeNull();
  });

  it('reports lockFiles for upload', () => {
    const collector = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({
      package_lock: join(fixtureDir, 'package-lock.json'),
      package_json: join(fixtureDir, 'package.json'),
    });
  });

  it('omits missing files from lockFiles', () => {
    const collector = new NpmCollector('/nonexistent/package-lock.json', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({});
  });

  it('lockFileHash returns null when lockfile is absent, and a sha256 hex digest when present', () => {
    const missing = new NpmCollector('/nonexistent/package-lock.json', '/nonexistent/package.json', new FakeRunner({}));
    expect(missing.lockFileHash()).toBeNull();

    const present = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(present.lockFileHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves packages unchanged when npm outdated output is malformed or not an object', () => {
    const malformed = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({
      'npm --version': { exitCode: 0, output: '' },
      'npm audit': { exitCode: 0, output: JSON.stringify({ vulnerabilities: {} }) },
      'npm outdated': { exitCode: 1, output: 'not json' },
    }));
    const payload = malformed.collect();
    expect(payload!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const nonObject = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({
      'npm --version': { exitCode: 0, output: '' },
      'npm audit': { exitCode: 0, output: JSON.stringify({ vulnerabilities: {} }) },
      'npm outdated': { exitCode: 0, output: 'null' },
    }));
    expect(nonObject.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('leaves a package unchanged when its outdated entry has no string latest field', () => {
    const collector = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({
      'npm --version': { exitCode: 0, output: '' },
      'npm audit': { exitCode: 0, output: JSON.stringify({ vulnerabilities: {} }) },
      'npm outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21' } }) },
    }));
    expect(collector.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('isToolAvailable reflects npm --version exit code', () => {
    const available = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({ 'npm --version': { exitCode: 0, output: '' } }));
    expect(available.isToolAvailable()).toBe(true);

    const unavailable = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), new FakeRunner({ 'npm --version': { exitCode: 127, output: '' } }));
    expect(unavailable.isToolAvailable()).toBe(false);
  });

  it('runs npm commands in the lockfile directory, not process.cwd()', () => {
    const runner = new FakeRunner({
      'npm --version': { exitCode: 0, output: '10.5.0' },
      'npm audit': { exitCode: 0, output: JSON.stringify({ vulnerabilities: {} }) },
      'npm outdated': { exitCode: 0, output: JSON.stringify({}) },
    });

    const collector = new NpmCollector(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'), runner);
    collector.collect();
    collector.isToolAvailable();

    expect(runner.capturedCwds.length).toBeGreaterThan(0);
    for (const cwd of runner.capturedCwds) {
      expect(cwd).toBe(fixtureDir);
      expect(cwd).not.toBe(process.cwd());
    }
  });
});
