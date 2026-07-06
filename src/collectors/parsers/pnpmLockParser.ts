import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { InventoryError } from '../../InventoryError';
import { createInventoryPayload, InventoryPayload, Package } from '../../dto/types';
import { privateNames } from '../isPrivateSource';

interface Entry {
  version: string;
  isDev: boolean;
  deps: string[];
  source?: string;
}

export function parsePnpmLock(lockFilePath: string, packageJsonPath: string): InventoryPayload {
  if (!existsSync(lockFilePath)) {
    throw new InventoryError(`pnpm-lock.yaml not found at ${lockFilePath}`);
  }

  const doc = parseYaml(readFileSync(lockFilePath, 'utf8'));

  if (typeof doc !== 'object' || doc === null) {
    throw new InventoryError(`Malformed pnpm-lock.yaml at ${lockFilePath}`);
  }

  if (doc.importers !== undefined || doc.snapshots !== undefined) {
    throw new InventoryError(
      `Unsupported pnpm-lock.yaml at ${lockFilePath}: workspace (importers:) and v9 (snapshots:) lockfiles are not supported yet. Expected single-project lockfileVersion 5/6.`,
    );
  }

  const directNames = Object.keys({ ...(doc.dependencies ?? {}), ...(doc.devDependencies ?? {}) });
  const devDirectNames = new Set(Object.keys(doc.devDependencies ?? {}));

  const entries = new Map<string, Entry>();
  for (const [key, rawEntry] of Object.entries<any>(doc.packages ?? {})) {
    if (!key.startsWith('/') || typeof rawEntry !== 'object' || rawEntry === null) {
      continue;
    }
    const withoutSlash = key.slice(1);
    const peerSuffixIndex = withoutSlash.indexOf('_');
    const nameAndVersion = peerSuffixIndex === -1 ? withoutSlash : withoutSlash.slice(0, peerSuffixIndex);
    const lastAt = nameAndVersion.lastIndexOf('@');
    const name = nameAndVersion.slice(0, lastAt);
    const version = nameAndVersion.slice(lastAt + 1);

    const deps = { ...(rawEntry.dependencies ?? {}), ...(rawEntry.optionalDependencies ?? {}) };
    // pnpm records a `resolution.tarball` URL only for sources it can't derive from the
    // configured registry (git, direct tarball, some custom registries). Registry packages
    // carry just `integrity`, so an absent tarball reads as public.
    const tarball = rawEntry.resolution?.tarball;
    const source = typeof tarball === 'string' ? tarball : undefined;

    entries.set(name, {
      version,
      isDev: Boolean(rawEntry.dev) || devDirectNames.has(name),
      deps: Object.keys(deps),
      source,
    });
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
