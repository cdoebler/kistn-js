import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseYarnBerryLock } from '../../../src/collectors/parsers/yarnBerryLockParser';
import { InventoryError } from '../../../src/InventoryError';

const fixtureDir = join(__dirname, '../../fixtures/yarn-berry');

describe('parseYarnBerryLock', () => {
  it('throws InventoryError when yarn.lock does not exist', () => {
    expect(() => parseYarnBerryLock('/nonexistent/yarn.lock', join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('throws InventoryError when the lockfile is not a YAML mapping', () => {
    expect(() => parseYarnBerryLock(writeTmp('just a scalar string\n'), join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('skips workspace:/patch:/link:-only entries with no npm: descriptor', () => {
    const lock = '"workspace-only@workspace:packages/thing":\n  version: 1.0.0\n';
    const payload = parseYarnBerryLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('skips entries with no resolvable version', () => {
    const lock = '"unversioned@npm:^1.0.0":\n  resolution: "unversioned@npm:1.0.0"\n';
    const payload = parseYarnBerryLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('keeps the first-seen version when two transitive-only entries conflict and neither matches a direct range', () => {
    const lock = [
      '"transitive-thing@npm:^1.0.0":',
      '  version: 1.0.0',
      '',
      '"transitive-thing@npm:^2.0.0":',
      '  version: 2.0.0',
      '',
    ].join('\n');
    const payload = parseYarnBerryLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName['transitive-thing']).toMatchObject({ version: '1.0.0' });
  });

  it('parses npm: protocol entries with direct deps, transitive deps, and BFS depth', () => {
    const payload = parseYarnBerryLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: true, isDev: false, depth: 0 });
    expect(byName.typescript).toMatchObject({ version: '5.4.5', isDirect: true, isDev: true, depth: 0 });
    expect(byName['has-flag']).toMatchObject({ version: '4.0.0', isDirect: false, isDev: false, depth: 1 });
  });

  it('resolves conflicting top-level versions in favor of the direct dependency range, regardless of file order', () => {
    const payload = parseYarnBerryLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    // yarn.lock lists semver@npm:^6.3.1 (transitive-only) before semver@npm:^7.6.0 (matches the
    // package.json direct range) — the direct-matching entry must win despite being second.
    expect(byName.semver).toMatchObject({ version: '7.6.0', isDirect: true, isDev: false, depth: 0 });
  });

  it('does not drop a package whose merged key has a non-npm: descriptor listed before its npm: descriptor', () => {
    const payload = parseYarnBerryLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName['workspace-thing']).toMatchObject({ version: '1.2.3' });
  });

  it('reports no private packages (berry lockfiles carry no public-vs-private signal)', () => {
    const payload = parseYarnBerryLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    expect(payload.privatePackages).toEqual([]);
  });
});

function writeTmp(content: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'yarn-berry-fixture-'));
  const path = join(tmp, 'yarn.lock');
  writeFileSync(path, content);
  return path;
}
