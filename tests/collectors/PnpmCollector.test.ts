import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PnpmCollector } from '../../src/collectors/PnpmCollector';
import { ProcessRunnerInterface, ProcessResult } from '../../src/process/ProcessRunner';

const fixtureDir = join(__dirname, '../fixtures/pnpm');

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

describe('PnpmCollector', () => {
  it('collects packages and merges outdated versions', () => {
    const runner = new FakeRunner({
      'pnpm --version': { exitCode: 0, output: '8.15.0' },
      'pnpm audit': { exitCode: 0, output: '{}' },
      'pnpm outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21', latest: '4.17.22' } }) },
    });

    const collector = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), runner);
    const payload = collector.collect();

    expect(payload!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBe('4.17.22');
  });

  it('reports lockFiles for upload', () => {
    const collector = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({
      pnpm_lock: join(fixtureDir, 'pnpm-lock.yaml'),
      package_json: join(fixtureDir, 'package.json'),
    });
  });

  it('omits missing files from lockFiles', () => {
    const collector = new PnpmCollector('/nonexistent/pnpm-lock.yaml', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({});
  });

  it('returns null when lockfile is absent', () => {
    const collector = new PnpmCollector('/nonexistent/pnpm-lock.yaml', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.collect()).toBeNull();
  });

  it('lockFileHash returns null when lockfile is absent, and a sha256 hex digest when present', () => {
    const missing = new PnpmCollector('/nonexistent/pnpm-lock.yaml', '/nonexistent/package.json', new FakeRunner({}));
    expect(missing.lockFileHash()).toBeNull();

    const present = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(present.lockFileHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves packages unchanged when pnpm outdated output is malformed, not an object, or missing a string latest', () => {
    const base = { 'pnpm --version': { exitCode: 0, output: '' }, 'pnpm audit': { exitCode: 0, output: '{}' } };

    const malformed = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'pnpm outdated': { exitCode: 1, output: 'not json' },
    }));
    expect(malformed.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const nonObject = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'pnpm outdated': { exitCode: 0, output: 'null' },
    }));
    expect(nonObject.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const noLatest = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'pnpm outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21' } }) },
    }));
    expect(noLatest.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('ecosystem is npm', () => {
    const collector = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(collector.ecosystem()).toBe('npm');
  });

  it('runs pnpm commands in the lockfile directory, not process.cwd()', () => {
    const runner = new FakeRunner({
      'pnpm --version': { exitCode: 0, output: '8.15.0' },
      'pnpm audit': { exitCode: 0, output: JSON.stringify({ advisories: {} }) },
      'pnpm outdated': { exitCode: 0, output: JSON.stringify({}) },
    });

    const collector = new PnpmCollector(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'), runner);
    collector.collect();
    collector.isToolAvailable();

    expect(runner.capturedCwds.length).toBeGreaterThan(0);
    for (const cwd of runner.capturedCwds) {
      expect(cwd).toBe(fixtureDir);
      expect(cwd).not.toBe(process.cwd());
    }
  });
});
