import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseBunLock } from '../../../src/collectors/parsers/bunLockParser';
import { InventoryError } from '../../../src/InventoryError';

const fixtureDir = join(__dirname, '../../fixtures/bun');

describe('parseBunLock', () => {
  it('parses direct deps, transitive deps, dev flags, and BFS depth', () => {
    const payload = parseBunLock(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: true, isDev: false, depth: 0 });
    expect(byName.typescript).toMatchObject({ version: '5.4.5', isDirect: true, isDev: true, depth: 0 });
    expect(byName['has-flag']).toMatchObject({ version: '4.0.0', isDirect: false, isDev: false, depth: 1 });
  });

  it('sets ecosystem to npm for all packages', () => {
    const payload = parseBunLock(join(fixtureDir, 'bun.lock'), join(fixtureDir, 'package.json'));

    for (const pkg of payload.packages) {
      expect(pkg.ecosystem).toBe('npm');
    }
  });

  it('throws InventoryError when bun.lock does not exist', () => {
    expect(() => parseBunLock('/nonexistent/bun.lock', join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('throws InventoryError on malformed JSONC', () => {
    const lockPath = writeTmp('not valid json at all }{');
    expect(() => parseBunLock(lockPath, join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('throws InventoryError for truncated or corrupt JSONC', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bun-bad-'));
    const path = join(tmp, 'bun.lock');
    writeFileSync(path, '{ "packages": { "x": ["x@1.0.0" GARBAGE');
    expect(() => parseBunLock(path, join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('throws InventoryError when the lockfile is not a JSON object', () => {
    const lockPath = writeTmp('42');
    expect(() => parseBunLock(lockPath, join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('skips package entries that are not tuples of at least 4 elements', () => {
    const lock = `{
      "packages": {
        "not-a-tuple": "oops",
        "too-short": ["only-one-element"]
      }
    }`;
    const payload = parseBunLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('correctly extracts version from scoped packages using lastIndexOf', () => {
    const lock = `{
      "lockfileVersion": 0,
      "workspaces": {
        "": {
          "name": "fixture-app",
          "dependencies": {
            "@scope/pkg": "^1.0.0",
          },
        },
      },
      "packages": {
        "@scope/pkg": ["@scope/pkg@1.2.3", "", {}, "sha512-EXAMPLE"],
      },
    }`;
    const lockPath = writeTmp(lock);
    const payload = parseBunLock(lockPath, join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName['@scope/pkg']).toMatchObject({ version: '1.2.3', isDirect: true, isDev: false, depth: 0 });
  });
  it('reports packages with a non-public registry field as private', () => {
    const lock = JSON.stringify({
      lockfileVersion: 0,
      workspaces: { '': { name: 'app', dependencies: { lodash: '^4.17.21', '@acme/widget': '^1.0.0' } } },
      packages: {
        lodash: ['lodash@4.17.21', '', {}, 'sha512-EXAMPLE'],
        '@acme/widget': ['@acme/widget@1.0.0', 'https://npm.corp.example/', {}, 'sha512-EXAMPLE'],
      },
    });
    const payload = parseBunLock(writeTmp(lock), '/nonexistent/package.json');
    expect(payload.privatePackages).toEqual(['@acme/widget']);
  });
});

function writeTmp(content: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'bun-fixture-'));
  const path = join(tmp, 'bun.lock');
  writeFileSync(path, content);
  return path;
}
