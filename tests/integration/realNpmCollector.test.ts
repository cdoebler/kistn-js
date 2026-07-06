// tests/integration/realNpmCollector.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { NpmCollector } from '../../src/collectors/NpmCollector';
import { ShellProcessRunner } from '../../src/process/ProcessRunner';

const runIntegration = process.env.RUN_REAL_PM_TESTS === '1';

describe.runIf(runIntegration)('NpmCollector (real npm CLI)', () => {
  it('collects a real package list via actual npm install + npm audit/outdated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inv-real-npm-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { 'has-flag': '4.0.0' } }));
      execSync('npm install', { cwd: dir, stdio: 'ignore' });

      const collector = new NpmCollector(join(dir, 'package-lock.json'), join(dir, 'package.json'), new ShellProcessRunner());
      const payload = collector.collect();

      expect(payload).not.toBeNull();
      expect(payload!.packages.some((p) => p.name === 'has-flag' && p.version === '4.0.0')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
