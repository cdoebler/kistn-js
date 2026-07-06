import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectPackageManager } from '../src/detectPackageManager';
import { BunCollector } from '../src/collectors/BunCollector';
import { PnpmCollector } from '../src/collectors/PnpmCollector';
import { YarnCollector } from '../src/collectors/YarnCollector';
import { NpmCollector } from '../src/collectors/NpmCollector';
import { ProcessRunnerInterface, ProcessResult } from '../src/process/ProcessRunner';

class FakeRunner implements ProcessRunnerInterface {
  run(_command: string, _cwd: string): ProcessResult {
    return { exitCode: 1, output: '' };
  }
}

let tempDir: string;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('detectPackageManager', () => {
  it('returns null when no lockfile exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeNull();
  });

  it('prefers bun.lock over all others', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    writeFileSync(join(tempDir, 'bun.lock'), '');
    writeFileSync(join(tempDir, 'bun.lockb'), '');
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    writeFileSync(join(tempDir, 'package-lock.json'), '{}');
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeInstanceOf(BunCollector);
    // bun.lock (not bun.lockb) should be selected
    expect((result as any).lockFilePath).toBe(join(tempDir, 'bun.lock'));
  });

  it('detects bun.lockb as BunCollector when bun.lock is absent', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    writeFileSync(join(tempDir, 'bun.lockb'), '');
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeInstanceOf(BunCollector);
    expect((result as any).lockFilePath).toBe(join(tempDir, 'bun.lockb'));
  });

  it('prefers pnpm-lock.yaml over yarn.lock and package-lock.json', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    writeFileSync(join(tempDir, 'package-lock.json'), '{}');
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeInstanceOf(PnpmCollector);
  });

  it('prefers yarn.lock over package-lock.json', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    writeFileSync(join(tempDir, 'yarn.lock'), '');
    writeFileSync(join(tempDir, 'package-lock.json'), '{}');
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeInstanceOf(YarnCollector);
  });

  it('falls back to package-lock.json', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'si-detect-'));
    writeFileSync(join(tempDir, 'package-lock.json'), '{}');
    const result = detectPackageManager(tempDir, new FakeRunner());
    expect(result).toBeInstanceOf(NpmCollector);
  });
});
