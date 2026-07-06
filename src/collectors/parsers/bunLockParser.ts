import { existsSync, readFileSync } from 'node:fs';
import { parse as parseJsonc, ParseError } from 'jsonc-parser';
import { InventoryError } from '../../InventoryError';
import { createInventoryPayload, InventoryPayload, Package } from '../../dto/types';
import { privateNames } from '../isPrivateSource';

interface Entry {
  version: string;
  deps: string[];
  source?: string;
}

export function parseBunLock(lockFilePath: string, packageJsonPath: string): InventoryPayload {
  if (!existsSync(lockFilePath)) {
    throw new InventoryError(`bun.lock not found at ${lockFilePath}`);
  }

  const errors: ParseError[] = [];
  const doc = parseJsonc(readFileSync(lockFilePath, 'utf8'), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new InventoryError(`Malformed bun.lock at ${lockFilePath}`);
  }

  if (typeof doc !== 'object' || doc === null) {
    throw new InventoryError(`Malformed bun.lock at ${lockFilePath}`);
  }

  const root = doc.workspaces?.[''] ?? {};
  const directDeps: Record<string, string> = root.dependencies ?? {};
  const directDevDeps: Record<string, string> = root.devDependencies ?? {};

  const directNames = [...Object.keys(directDeps), ...Object.keys(directDevDeps)];
  const devDirectNames = new Set(Object.keys(directDevDeps));

  const entries = new Map<string, Entry>();
  for (const [name, tuple] of Object.entries<any>(doc.packages ?? {})) {
    if (!Array.isArray(tuple) || tuple.length < 4) {
      continue;
    }

    // tuple[0] is the identifier: "name@version" — use lastIndexOf to handle scoped packages
    const identifier: string = tuple[0];
    const atIndex = identifier.lastIndexOf('@');
    const version = atIndex === -1 ? identifier : identifier.slice(atIndex + 1);

    // tuple[2] is the deps object: {} or { dependencies: {...}, optionalDependencies: {...} }
    const depsHolder = typeof tuple[2] === 'object' && tuple[2] !== null ? tuple[2] : {};
    const deps = {
      ...(depsHolder.dependencies ?? {}),
      ...(depsHolder.optionalDependencies ?? {}),
    };

    // tuple[1] is the resolution/registry string: "" for the default public registry,
    // otherwise a tarball/git/custom-registry URL.
    const registry = typeof tuple[1] === 'string' && tuple[1] !== '' ? tuple[1] : undefined;

    entries.set(name, {
      version,
      deps: Object.keys(deps),
      source: registry,
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
      isDev: devDirectNames.has(name),
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
