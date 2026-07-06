import { existsSync, readFileSync } from 'node:fs';
import * as yarnLockfile from '@yarnpkg/lockfile';
import { InventoryError } from '../../InventoryError';
import { createInventoryPayload, InventoryPayload, Package } from '../../dto/types';
import { privateNames } from '../isPrivateSource';

interface Entry {
  version: string;
  deps: string[];
  source?: string;
}

export function parseYarnClassicLock(lockFilePath: string, packageJsonPath: string): InventoryPayload {
  if (!existsSync(lockFilePath)) {
    throw new InventoryError(`yarn.lock not found at ${lockFilePath}`);
  }

  const parsed = yarnLockfile.parse(readFileSync(lockFilePath, 'utf8'));

  // 'merge' means the file had git-merge-conflict markers but both variants still parsed
  // cleanly into a usable merged object; only 'conflict' (or a missing object) is unparseable.
  if (
    (parsed.type !== 'success' && parsed.type !== 'merge') ||
    typeof parsed.object !== 'object' ||
    parsed.object === null
  ) {
    throw new InventoryError(`Malformed yarn.lock at ${lockFilePath}`);
  }

  const { dependencies, devDependencies } = directDependencies(packageJsonPath);
  const directNames = Object.keys({ ...dependencies, ...devDependencies });
  const devDirectNames = new Set(Object.keys(devDependencies));
  const directRanges: Record<string, string> = { ...dependencies, ...devDependencies };

  const entries = new Map<string, Entry>();
  for (const [mergedKey, resolved] of Object.entries<any>(parsed.object)) {
    const descriptors = mergedKey.split(', ');
    const firstDescriptor = descriptors[0];
    const name = descriptorName(firstDescriptor);
    const version = typeof resolved.version === 'string' ? resolved.version : '';

    if (name === '' || version === '') {
      continue;
    }

    // Yarn classic's lockfile descriptor keys are literally the range strings from
    // package.json (or a parent package's own package.json). When this merged key contains
    // the exact `name@<direct range>` descriptor, it's confirmed to be the resolution actually
    // used by the direct dependency declaration, so it wins over any existing entry for the
    // same name — even one encountered earlier in file order.
    const directRange = directRanges[name];
    const matchesDirectRange = directRange !== undefined && descriptors.includes(`${name}@${directRange}`);

    if (entries.has(name) && !matchesDirectRange) {
      // Both entries are transitive-only conflicting versions with no way to disambiguate
      // from available data — keep first-seen. This residual ambiguity is an accepted limitation.
      continue;
    }

    const deps = { ...(resolved.dependencies ?? {}), ...(resolved.optionalDependencies ?? {}) };
    const source = typeof resolved.resolved === 'string' ? resolved.resolved : undefined;
    entries.set(name, { version, deps: Object.keys(deps), source });
  }

  const depths = computeDepths(entries, directNames);

  const packages: Package[] = [];
  for (const [name, data] of entries) {
    packages.push({
      name,
      version: data.version,
      ecosystem: 'npm',
      isDirect: directNames.includes(name),
      isDev: devDirectNames.has(name),
      depth: depths.get(name) ?? null,
    });
  }

  return createInventoryPayload(packages, [], privateNames(entries));
}

// A descriptor is `name@range`, optionally quoted (`"@scope/name@range"`). The package name
// itself may contain an `@` (scoped packages), but only as its leading character, so the
// rightmost `@` always separates the name from the semver range — including for scoped names.
function descriptorName(descriptor: string): string {
  const unquoted = descriptor.startsWith('"') && descriptor.endsWith('"') ? descriptor.slice(1, -1) : descriptor;
  const lastAt = unquoted.lastIndexOf('@');
  return lastAt <= 0 ? unquoted : unquoted.slice(0, lastAt);
}

function directDependencies(packageJsonPath: string): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  if (!existsSync(packageJsonPath)) {
    return { dependencies: {}, devDependencies: {} };
  }
  const json = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return {
    dependencies: json.dependencies ?? {},
    devDependencies: json.devDependencies ?? {},
  };
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
