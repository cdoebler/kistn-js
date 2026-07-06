import { Package } from '../dto/types';

/**
 * Applies the `<pm> outdated --json` output shared by npm, pnpm, bun and yarn
 * berry — a flat `{ name: { latest } }` map — onto the parsed packages. Any
 * missing/malformed output leaves the packages untouched (best-effort).
 */
export function applyNpmStyleOutdated(packages: Package[], rawOutput: string): Package[] {
  let data: any;
  try {
    data = JSON.parse(rawOutput);
  } catch {
    return packages;
  }
  if (typeof data !== 'object' || data === null) {
    return packages;
  }
  return packages.map((pkg) => {
    const entry = data[pkg.name];
    return entry && typeof entry.latest === 'string' ? { ...pkg, availableVersion: entry.latest } : pkg;
  });
}
