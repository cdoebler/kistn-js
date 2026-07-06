import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CollectorInterface } from './collectors/CollectorInterface';
import { BunCollector } from './collectors/BunCollector';
import { PnpmCollector } from './collectors/PnpmCollector';
import { YarnCollector } from './collectors/YarnCollector';
import { NpmCollector } from './collectors/NpmCollector';
import { ProcessRunnerInterface } from './process/ProcessRunner';

export function detectPackageManager(projectDir: string, runner: ProcessRunnerInterface): CollectorInterface | null {
  const packageJsonPath = join(projectDir, 'package.json');

  if (existsSync(join(projectDir, 'bun.lock'))) {
    return new BunCollector(join(projectDir, 'bun.lock'), packageJsonPath, runner);
  }

  if (existsSync(join(projectDir, 'bun.lockb'))) {
    return new BunCollector(join(projectDir, 'bun.lockb'), packageJsonPath, runner);
  }

  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) {
    return new PnpmCollector(join(projectDir, 'pnpm-lock.yaml'), packageJsonPath, runner);
  }

  if (existsSync(join(projectDir, 'yarn.lock'))) {
    return new YarnCollector(join(projectDir, 'yarn.lock'), packageJsonPath, runner);
  }

  if (existsSync(join(projectDir, 'package-lock.json'))) {
    return new NpmCollector(join(projectDir, 'package-lock.json'), packageJsonPath, runner);
  }

  return null;
}
