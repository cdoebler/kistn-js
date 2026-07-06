import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { BunCollector } from '../../src/collectors/BunCollector';
import { ProcessRunnerInterface, ProcessResult } from '../../src/process/ProcessRunner';
import { InventoryError } from '../../src/InventoryError';

const fixtureDir = join(__dirname, '../fixtures/bun');

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

describe('BunCollector', () => {
  it('collects packages and merges outdated versions', () => {
    const runner = new FakeRunner({
      'bun --version': { exitCode: 0, output: '1.1.0' },
      'bun audit': { exitCode: 0, output: '{}' },
      'bun outdated': { exitCode: 0, output: JSON.stringify({ lodash: { current: '4.17.21', latest: '4.17.22' } }) },
    });

    const collector = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), runner);
    const payload = collector.collect();

    expect(payload).not.toBeNull();
    const lodash = payload!.packages.find((p) => p.name === 'lodash');
    expect(lodash).toBeDefined();
    expect(lodash?.availableVersion).toBe('4.17.22');
  });

  it('surfaces audit findings from bun audit JSON output', () => {
    const bunAuditOutput = JSON.stringify({
      lodash: [
        {
          id: 1106913,
          url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
          title: 'Command Injection in lodash',
          severity: 'high',
          vulnerable_versions: '<4.17.21',
        },
      ],
    });

    const runner = new FakeRunner({
      'bun --version': { exitCode: 0, output: '1.1.0' },
      'bun audit': { exitCode: 1, output: bunAuditOutput },
      'bun outdated': { exitCode: 0, output: '{}' },
    });

    const collector = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), runner);
    const payload = collector.collect();

    expect(payload).not.toBeNull();
    expect(payload!.findings).toHaveLength(1);
    expect(payload!.findings[0]).toMatchObject({
      packageName: 'lodash',
      advisoryId: 'GHSA-35jh-r3h4-6jhm',
      severity: 'high',
    });
  });

  it('returns null when lockfile is absent', () => {
    const collector = new BunCollector('/nonexistent/bun.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.collect()).toBeNull();
  });

  it('reports lockFiles for upload', () => {
    const collector = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({
      bun_lock: join(fixtureDir, 'bun.lock'),
      package_json: join(fixtureDir, 'package.json'),
    });
  });

  it('omits missing files from lockFiles', () => {
    const collector = new BunCollector('/nonexistent/bun.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(collector.lockFiles()).toEqual({});
  });

  it('lockFileHash returns null when lockfile is absent, and a sha256 hex digest when present', () => {
    const missing = new BunCollector('/nonexistent/bun.lock', '/nonexistent/package.json', new FakeRunner({}));
    expect(missing.lockFileHash()).toBeNull();

    const present = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({}));
    expect(present.lockFileHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves packages unchanged when bun outdated output is malformed, not an object, or missing a string latest', () => {
    const base = { 'bun --version': { exitCode: 0, output: '' }, 'bun audit': { exitCode: 0, output: '{}' } };

    const malformed = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'bun outdated': { exitCode: 1, output: 'not json' },
    }));
    expect(malformed.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const nonObject = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'bun outdated': { exitCode: 0, output: 'null' },
    }));
    expect(nonObject.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();

    const noLatest = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({
      ...base,
      'bun outdated': { exitCode: 1, output: JSON.stringify({ lodash: { current: '4.17.21' } }) },
    }));
    expect(noLatest.collect()!.packages.find((p) => p.name === 'lodash')?.availableVersion).toBeUndefined();
  });

  it('throws a clear error for legacy binary bun.lockb', () => {
    const collector = new BunCollector('/project/bun.lockb', '/project/package.json', new FakeRunner({}));
    expect(() => collector.collect()).toThrow(InventoryError);
    expect(() => collector.collect()).toThrow(/Bun.*1\.1/);
  });

  it('isToolAvailable reflects bun --version exit code', () => {
    const available = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({ 'bun --version': { exitCode: 0, output: '' } }));
    expect(available.isToolAvailable()).toBe(true);

    const unavailable = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), new FakeRunner({ 'bun --version': { exitCode: 127, output: '' } }));
    expect(unavailable.isToolAvailable()).toBe(false);
  });

  it('runs bun commands in the lockfile directory, not process.cwd()', () => {
    const runner = new FakeRunner({
      'bun --version': { exitCode: 0, output: '1.1.0' },
      'bun audit': { exitCode: 0, output: '{}' },
      'bun outdated': { exitCode: 0, output: '{}' },
    });

    const collector = new BunCollector(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'), runner);
    collector.collect();
    collector.isToolAvailable();

    expect(runner.capturedCwds.length).toBeGreaterThan(0);
    for (const cwd of runner.capturedCwds) {
      expect(cwd).toBe(fixtureDir);
      expect(cwd).not.toBe(process.cwd());
    }
  });
});
