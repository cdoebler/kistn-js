import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { CollectorInterface } from './CollectorInterface';
import { parseBunLock } from './parsers/bunLockParser';
import { parseBunAudit } from './parseBunAudit';
import { applyNpmStyleOutdated } from './applyNpmStyleOutdated';
import { InventoryPayload, createInventoryPayload, Package } from '../dto/types';
import { ProcessRunnerInterface } from '../process/ProcessRunner';
import { InventoryError } from '../InventoryError';

export class BunCollector implements CollectorInterface {
  constructor(
    private readonly lockFilePath: string,
    private readonly packageJsonPath: string,
    private readonly runner: ProcessRunnerInterface,
  ) {}

  collect(): InventoryPayload | null {
    if (this.lockFilePath.endsWith('.lockb')) {
      throw new InventoryError(
        'Binary bun.lockb lockfiles are not supported. Upgrade to Bun ≥1.1 to use the text-format bun.lock.',
      );
    }

    if (!existsSync(this.lockFilePath)) {
      return null;
    }

    const payload = parseBunLock(this.lockFilePath, this.packageJsonPath);
    const installedVersions = Object.fromEntries(payload.packages.map((p) => [p.name, p.version]));

    const findings = this.runAudit(installedVersions);
    const packages = this.applyOutdated(payload.packages);

    return createInventoryPayload(packages, findings, payload.privatePackages);
  }

  ecosystem(): string {
    return 'npm';
  }

  lockFileHash(): string | null {
    if (!existsSync(this.lockFilePath)) {
      return null;
    }
    return createHash('sha256').update(readFileSync(this.lockFilePath)).digest('hex');
  }

  isToolAvailable(): boolean {
    return this.runner.run('bun --version', dirname(this.lockFilePath)).exitCode === 0;
  }

  lockFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    if (existsSync(this.lockFilePath)) {
      files.bun_lock = this.lockFilePath;
    }
    if (existsSync(this.packageJsonPath)) {
      files.package_json = this.packageJsonPath;
    }
    return files;
  }

  private runAudit(installedVersions: Record<string, string>): InventoryPayload['findings'] {
    const result = this.runner.run('bun audit --json', dirname(this.lockFilePath));
    return parseBunAudit(result.output, installedVersions);
  }

  private applyOutdated(packages: Package[]): Package[] {
    const result = this.runner.run('bun outdated --json', dirname(this.lockFilePath));
    return applyNpmStyleOutdated(packages, result.output);
  }
}
