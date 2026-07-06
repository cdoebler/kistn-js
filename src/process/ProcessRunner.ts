import { spawnSync } from 'node:child_process';

export interface ProcessResult {
  exitCode: number;
  output: string;
}

export interface ProcessRunnerInterface {
  run(command: string, cwd: string): ProcessResult;
}

export class ShellProcessRunner implements ProcessRunnerInterface {
  run(command: string, cwd: string): ProcessResult {
    // ponytail: naive whitespace split — every call site passes a fixed command with plain
    // flag args (no quoting/spaces). Passing an arg array with shell:false keeps the shell out
    // of the loop on POSIX (no injection surface). Windows still needs the shell to resolve the
    // npm/yarn/pnpm/bun `.cmd` shims, which spawn can't launch directly.
    const [binary, ...args] = command.split(' ');
    const result = spawnSync(binary, args, {
      cwd,
      shell: process.platform === 'win32',
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.error) {
      // Covers spawn failures and maxBuffer overflow, both of which would otherwise silently
      // yield empty output and drop findings.
      console.error(`Command did not run to completion: ${command} (${result.error.message})`);
    }

    return {
      exitCode: result.status ?? 1,
      output: result.stdout ?? '',
    };
  }
}
