import { describe, it, expect, vi } from 'vitest';
import { ShellProcessRunner } from '../../src/process/ProcessRunner';

describe('ShellProcessRunner', () => {
  it('captures stdout and exit code of a successful command', () => {
    const runner = new ShellProcessRunner();
    const result = runner.run('echo hello', process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('hello');
  });

  it('passes multiple flag arguments through to the binary', () => {
    const runner = new ShellProcessRunner();
    const result = runner.run('echo -n done', process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('done');
  });

  it('captures non-zero exit code without throwing', () => {
    const runner = new ShellProcessRunner();
    const result = runner.run('false', process.cwd());
    expect(result.exitCode).toBe(1);
  });

  it('falls back to exitCode 1 and empty output and warns when the process never spawns', () => {
    const runner = new ShellProcessRunner();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = runner.run('echo hi', '/nonexistent-dir-xyz');
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe('');
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
