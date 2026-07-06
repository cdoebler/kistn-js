import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { InventoryError } from '../../InventoryError';
import { createInventoryPayload, InventoryPayload, Package } from '../../dto/types';

interface Entry {
  version: string;
  deps: string[];
}

export function parseYarnBerryLock(lockFilePath: string, packageJsonPath: string): InventoryPayload {
  if (!existsSync(lockFilePath)) {
    throw new InventoryError(`yarn.lock not found at ${lockFilePath}`);
  }

  const doc = parseYaml(readFileSync(lockFilePath, 'utf8'));

  if (typeof doc !== 'object' || doc === null) {
    throw new InventoryError(`Malformed yarn.lock at ${lockFilePath}`);
  }

  const { dependencies, devDependencies } = directDependencies(packageJsonPath);
  const directNames = Object.keys({ ...dependencies, ...devDependencies });
  const devDirectNames = new Set(Object.keys(devDependencies));
  const directRanges: Record<string, string> = { ...dependencies, ...devDependencies };

  const entries = new Map<string, Entry>();
  for (const [mergedKey, resolved] of Object.entries<any>(doc)) {
    if (mergedKey === '__metadata' || typeof resolved !== 'object' || resolved === null) {
      continue;
    }

    const descriptors = mergedKey.split(', ');
    // Yarn berry merges descriptors that resolve to the same version regardless of protocol, so
    // an `npm:` descriptor may appear anywhere in the list (e.g. after a `patch:`/`workspace:`
    // one). Scan all of them and use the first with an npm-resolvable identity.
    const npmDescriptor = descriptors.find((descriptor) => descriptor.includes('@npm:'));
    if (npmDescriptor === undefined) {
      continue; // purely workspace:/patch:/link: protocol entries — not supported in v1
    }
    const npmIndex = npmDescriptor.indexOf('@npm:');
    const name = npmDescriptor.slice(0, npmIndex);
    const version = typeof resolved.version === 'string' ? resolved.version : '';

    if (name === '' || version === '') {
      continue;
    }

    // Yarn berry's descriptor keys are `name@npm:<range>`, where <range> is the literal range
    // string from package.json (or a parent package's own package.json). When this merged key
    // contains the exact `name@npm:<direct range>` descriptor, it's confirmed to be the
    // resolution actually used by the direct dependency declaration, so it wins over any
    // existing entry for the same name — even one encountered earlier in file order.
    const directRange = directRanges[name];
    const matchesDirectRange = directRange !== undefined && descriptors.includes(`${name}@npm:${directRange}`);

    if (entries.has(name) && !matchesDirectRange) {
      // Both entries are transitive-only conflicting versions with no way to disambiguate
      // from available data — keep first-seen. This residual ambiguity is an accepted limitation.
      continue;
    }

    const deps = { ...(resolved.dependencies ?? {}), ...(resolved.optionalDependencies ?? {}) };
    entries.set(name, { version, deps: Object.keys(deps) });
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

  // ponytail: private-package detection is intentionally empty for berry. Every registry
  // dependency uses the `@npm:` protocol regardless of whether it came from the public
  // registry or an enterprise one (the real registry lives in .yarnrc.yml, not the lockfile),
  // so the lockfile carries no reliable public-vs-private signal. Add it if berry gains one.
  return createInventoryPayload(packages);
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
