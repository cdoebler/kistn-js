import { existsSync, readFileSync } from 'node:fs';
import { InventoryError } from '../../InventoryError';
import { createInventoryPayload, InventoryPayload, Package } from '../../dto/types';
import { privateNames } from '../isPrivateSource';

interface Entry {
  version: string;
  isDev: boolean;
  deps: string[];
  source?: string;
}

export function parseNpmLock(lockFilePath: string, packageJsonPath: string): InventoryPayload {
  if (!existsSync(lockFilePath)) {
    throw new InventoryError(`package-lock.json not found at ${lockFilePath}`);
  }

  const lock = JSON.parse(readFileSync(lockFilePath, 'utf8'));
  const packageMap = lock.packages;

  if (typeof packageMap !== 'object' || packageMap === null) {
    throw new InventoryError(`Unsupported or malformed package-lock.json at ${lockFilePath}. lockfileVersion 2 or 3 required.`);
  }

  const directNames = rootDirectNames(packageMap, packageJsonPath);
  const entries = new Map<string, Entry>();
  const winningDepths = new Map<string, number>();

  for (const [path, rawEntry] of Object.entries<any>(packageMap)) {
    if (path === '' || !path.startsWith('node_modules/') || typeof rawEntry !== 'object' || rawEntry === null) {
      continue;
    }

    const lastOffset = path.lastIndexOf('node_modules/');
    const name = path.slice(lastOffset + 'node_modules/'.length);
    const version = typeof rawEntry.version === 'string' ? rawEntry.version : '';

    if (name === '' || version === '') {
      continue;
    }

    // Object key order in the lockfile's `packages` map is not guaranteed to be
    // shallowest-first — it's alphabetical by path, so e.g. "node_modules/abc/node_modules/lodash"
    // sorts before "node_modules/lodash" despite being more deeply nested. Track the nesting
    // depth (number of "node_modules/" segments) that produced the current winner per name, and
    // only overwrite it when a shallower occurrence is found. Equal depth keeps the first seen.
    const pathDepth = nodeModulesDepth(path);
    const currentDepth = winningDepths.get(name);

    if (currentDepth !== undefined && pathDepth >= currentDepth) {
      continue;
    }

    const deps = { ...(rawEntry.dependencies ?? {}), ...(rawEntry.optionalDependencies ?? {}) };
    const source = typeof rawEntry.resolved === 'string' ? rawEntry.resolved : undefined;

    entries.set(name, { version, isDev: Boolean(rawEntry.dev), deps: Object.keys(deps), source });
    winningDepths.set(name, pathDepth);
  }

  const depths = computeDepths(entries, directNames);

  const packages: Package[] = [];
  for (const [name, data] of entries) {
    packages.push({
      name,
      version: data.version,
      ecosystem: 'npm',
      isDirect: directNames.includes(name),
      isDev: data.isDev,
      depth: depths.get(name) ?? null,
    });
  }

  return createInventoryPayload(packages, [], privateNames(entries));
}

function nodeModulesDepth(path: string): number {
  return path.split('node_modules/').length - 1;
}

function computeDepths(entries: Map<string, Entry>, directNames: string[]): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<[string, number]> = [];

  for (const name of directNames) {
    if (entries.has(name) && !depths.has(name)) {
      depths.set(name, 0);
      queue.push([name, 0]);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const [current, depth] = queue[head++];
    for (const dep of entries.get(current)?.deps ?? []) {
      if (entries.has(dep) && !depths.has(dep)) {
        depths.set(dep, depth + 1);
        queue.push([dep, depth + 1]);
      }
    }
  }

  return depths;
}

function rootDirectNames(packageMap: Record<string, any>, packageJsonPath: string): string[] {
  const root = packageMap[''];
  if (typeof root === 'object' && root !== null) {
    return Object.keys({
      ...(root.dependencies ?? {}),
      ...(root.devDependencies ?? {}),
      ...(root.optionalDependencies ?? {}),
    });
  }
  return directPackageNames(packageJsonPath);
}

function directPackageNames(packageJsonPath: string): string[] {
  if (!existsSync(packageJsonPath)) {
    return [];
  }
  const json = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return Object.keys({ ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) });
}
