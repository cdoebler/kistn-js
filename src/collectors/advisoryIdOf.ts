/**
 * Best available identifier for an audit advisory, or null when it carries none.
 * Callers skip null: the server drops findings without a real advisory id.
 */
export function advisoryIdOf(advisory: any): string | null {
  if (typeof advisory?.github_advisory_id === 'string' && advisory.github_advisory_id.length > 0) {
    return advisory.github_advisory_id;
  }

  const ghsa = typeof advisory?.url === 'string' ? advisory.url.match(/GHSA-[a-z0-9-]+/i) : null;
  if (ghsa) {
    return ghsa[0];
  }

  if (Array.isArray(advisory?.cves) && typeof advisory.cves[0] === 'string' && advisory.cves[0].length > 0) {
    return advisory.cves[0];
  }

  // npm's numeric advisory id: `id` in pnpm/yarn/bun output, `source` in npm audit's `via` objects.
  const numericId = advisory?.id ?? advisory?.source;
  if (typeof numericId === 'number' || (typeof numericId === 'string' && /^\d+$/.test(numericId))) {
    return `NPM-${numericId}`;
  }

  return null;
}
