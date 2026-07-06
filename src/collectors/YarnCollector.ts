import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { CollectorInterface } from './CollectorInterface';
import { parseYarnClassicLock } from './parsers/yarnClassicLockParser';
import { parseYarnBerryLock } from './parsers/yarnBerryLockParser';
import { parseYarnClassicAuditNdjson } from './parseYarnClassicAuditNdjson';
import { parseNpmStyleAudit } from './parseNpmStyleAudit';
import { applyNpmStyleOutdated } from './applyNpmStyleOutdated';
import { InventoryPayload, createInventoryPayload, Package } from '../dto/types';
import { ProcessRunnerInterface } from '../process/ProcessRunner';

export class YarnCollector implements CollectorInterface {
  constructor(
    private readonly lockFilePath: string,
    private readonly packageJsonPath: string,
    private readonly runner: ProcessRunnerInterface,
  ) {}

  collect(): InventoryPayload | null {
    if (!existsSync(this.lockFilePath)) {
      return null;
    }

    const cwd = dirname(this.lockFilePath);
    const isClassic = this.isClassic();
    const payload = isClassic
      ? parseYarnClassicLock(this.lockFilePath, this.packageJsonPath)
      : parseYarnBerryLock(this.lockFilePath, this.packageJsonPath);

    const installedVersions = Object.fromEntries(payload.packages.map((p) => [p.name, p.version]));
    // Berry replaced `yarn audit` with `yarn npm audit` (npm-style JSON); classic keeps its
    // own NDJSON `yarn audit`.
    const auditResult = this.runner.run(isClassic ? 'yarn audit --json' : 'yarn npm audit --json', cwd);
    const findings = isClassic
      ? parseYarnClassicAuditNdjson(auditResult.output, installedVersions)
      : parseNpmStyleAudit(auditResult.output, installedVersions);

    const packages = this.applyOutdated(payload.packages, isClassic, cwd);

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
    return this.runner.run('yarn --version', dirname(this.lockFilePath)).exitCode === 0;
  }

  lockFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    if (existsSync(this.lockFilePath)) {
      files.yarn_lock = this.lockFilePath;
    }
    if (existsSync(this.packageJsonPath)) {
      files.package_json = this.packageJsonPath;
    }
    return files;
  }

  private isClassic(): boolean {
    return readFileSync(this.lockFilePath, 'utf8').includes('yarn lockfile v1');
  }

  private applyOutdated(packages: Package[], isClassic: boolean, cwd: string): Package[] {
    const result = this.runner.run('yarn outdated --json', cwd);

    return isClassic
      ? this.applyClassicOutdated(packages, result.output)
      : applyNpmStyleOutdated(packages, result.output);
  }

  private applyClassicOutdated(packages: Package[], rawOutput: string): Package[] {
    let data: any;
    for (const line of rawOutput.split('\n')) {
      if (line.trim() === '') {
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed?.type === 'table') {
        data = parsed;
        break;
      }
    }

    if (data?.type !== 'table' || !Array.isArray(data?.data?.head) || !Array.isArray(data?.data?.body)) {
      return packages;
    }

    const head: string[] = data.data.head;
    const nameIdx = head.indexOf('Package');
    const latestIdx = head.indexOf('Latest');
    if (nameIdx === -1 || latestIdx === -1) {
      return packages;
    }

    const latestByName = new Map<string, string>();
    for (const row of data.data.body) {
      if (Array.isArray(row) && typeof row[nameIdx] === 'string' && typeof row[latestIdx] === 'string') {
        latestByName.set(row[nameIdx], row[latestIdx]);
      }
    }

    return packages.map((pkg) => {
      const latest = latestByName.get(pkg.name);
      return latest ? { ...pkg, availableVersion: latest } : pkg;
    });
  }
}
