const PUBLIC_REGISTRY_HOSTS = ['registry.npmjs.org', 'registry.yarnpkg.com'];

/**
 * A dependency is "private" when its resolved source is not one of the public
 * npm registries — i.e. it comes from an enterprise/custom registry, a git
 * remote, or a direct tarball/file URL. The Kistn server has no public advisory
 * data for such packages, so the client reports them separately.
 *
 * `source` is the raw resolution string carried by the lockfile: a
 * `resolved`/tarball URL (npm, yarn classic, pnpm) or bun's registry field. An
 * empty/absent source means the package came from the default public registry.
 */
export function isPrivateSource(source: string | undefined | null): boolean {
  if (!source) {
    return false;
  }
  return !PUBLIC_REGISTRY_HOSTS.some((host) => source.includes(`//${host}/`));
}

/**
 * Sorted names of the entries whose resolved source is private. Sorting keeps
 * the transmitted payload deterministic across runs.
 */
export function privateNames<T extends { source?: string }>(entries: Map<string, T>): string[] {
  const names: string[] = [];
  for (const [name, entry] of entries) {
    if (isPrivateSource(entry.source)) {
      names.push(name);
    }
  }
  return names.sort();
}
