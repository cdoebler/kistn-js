import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parsePnpmLock } from '../../../src/collectors/parsers/pnpmLockParser';
import { InventoryError } from '../../../src/InventoryError';

const fixtureDir = join(__dirname, '../../fixtures/pnpm');

describe('parsePnpmLock', () => {
  it('parses direct deps, transitive deps, dev flags, and BFS depth', () => {
    const payload = parsePnpmLock(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: true, isDev: false, depth: 0 });
    expect(byName.typescript).toMatchObject({ version: '5.4.5', isDirect: true, isDev: true, depth: 0 });
    expect(byName['has-flag']).toMatchObject({ version: '4.0.0', isDirect: false, isDev: false, depth: 1 });
  });

  it('correctly extracts name/version from scoped and peer-dependency-suffixed package keys', () => {
    const payload = parsePnpmLock(join(fixtureDir, 'pnpm-lock.yaml'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    // Scoped package, no peer suffix.
    expect(byName['@scope/pkg']).toMatchObject({ version: '1.0.0' });

    // Peer-suffixed package: must use the package's own version, not the peer's.
    expect(byName['eslint-plugin-react']).toMatchObject({ version: '7.30.0' });
    expect(byName['eslint-plugin-react@7.30.0_eslint']).toBeUndefined();

    // Scoped AND peer-suffixed package.
    expect(byName['@typescript-eslint/parser']).toMatchObject({ version: '5.0.0' });
  });

  it('throws InventoryError on workspace (importers:) lockfiles', () => {
    const payload = 'lockfileVersion: \'9.0\'\nimporters:\n  .:\n    dependencies: {}\npackages: {}\n';
    expect(() => parsePnpmLock(writeTmp(payload), join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('throws InventoryError on v9 (snapshots:) lockfiles', () => {
    const payload = 'lockfileVersion: \'9.0\'\nsnapshots: {}\npackages: {}\n';
    expect(() => parsePnpmLock(writeTmp(payload), join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('throws InventoryError when the lockfile does not exist', () => {
    expect(() => parsePnpmLock(join(fixtureDir, 'nope.yaml'), join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('throws InventoryError when the lockfile is not a YAML mapping', () => {
    expect(() => parsePnpmLock(writeTmp('just a scalar string\n'), join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('reports packages with a non-public resolution.tarball as private', () => {
    const payload = [
      'dependencies: {}',
      'packages:',
      '  /lodash@4.17.21:',
      '    resolution: {integrity: sha512-EXAMPLE}',
      '  /@acme/widget@1.0.0:',
      '    resolution: {tarball: https://npm.corp.example/@acme/widget/-/widget-1.0.0.tgz}',
      '',
    ].join('\n');
    const result = parsePnpmLock(writeTmp(payload), join(fixtureDir, 'package.json'));
    expect(result.privatePackages).toEqual(['@acme/widget']);
  });

  it('skips package entries with non-versioned keys or non-object values', () => {
    const payload = [
      'dependencies: {}',
      'packages:',
      '  no-leading-slash@1.0.0:',
      '    dev: false',
      '  /null-entry@1.0.0: null',
      '',
    ].join('\n');
    const result = parsePnpmLock(writeTmp(payload), join(fixtureDir, 'package.json'));
    expect(result.packages).toEqual([]);
  });
});

function writeTmp(content: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'pnpm-fixture-'));
  const path = join(tmp, 'pnpm-lock.yaml');
  writeFileSync(path, content);
  return path;
}
