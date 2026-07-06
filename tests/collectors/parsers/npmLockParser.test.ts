import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseNpmLock } from '../../../src/collectors/parsers/npmLockParser';
import { InventoryError } from '../../../src/InventoryError';

const fixtureDir = join(__dirname, '../../fixtures/npm');
const nestedFixtureDir = join(__dirname, '../../fixtures/npm-nested');

describe('parseNpmLock', () => {
  it('throws InventoryError when package-lock.json does not exist', () => {
    expect(() => parseNpmLock('/nonexistent/package-lock.json', join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('throws InventoryError when packages is missing or malformed', () => {
    const lockPath = writeTmp(JSON.stringify({ name: 'x', lockfileVersion: 3 }));
    expect(() => parseNpmLock(lockPath, join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('skips top-level keys that are not node_modules paths or have no object value', () => {
    const lock = {
      packages: {
        '': { dependencies: {} },
        'some-stray-key': { version: '1.0.0' },
        'node_modules/broken': null,
      },
    };
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('falls back to package.json direct deps when packages[""] is absent', () => {
    const lock = {
      packages: {
        'node_modules/lodash': { version: '4.17.21' },
      },
    };
    const packageJsonPath = writeTmpNamed('package.json', JSON.stringify({ dependencies: { lodash: '^4.17.21' } }));
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), packageJsonPath);
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ isDirect: true, depth: 0 });
  });

  it('skips node_modules paths with no version (missing or non-string)', () => {
    const lock = {
      packages: {
        '': { dependencies: {} },
        'node_modules/no-version': {},
      },
    };
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('falls back to no direct deps when neither packages[""] nor package.json exist', () => {
    const lock = {
      packages: {
        'node_modules/lodash': { version: '4.17.21' },
      },
    };
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), '/nonexistent/package.json');
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ isDirect: false, depth: null });
  });

  it('keeps the first-seen entry when two equally-deep paths resolve the same package name', () => {
    const lock = {
      packages: {
        '': { dependencies: { a: '^1.0.0', b: '^1.0.0' } },
        'node_modules/a': { version: '1.0.0', dependencies: { lodash: '^1.0.0' } },
        'node_modules/b': { version: '1.0.0', dependencies: { lodash: '^2.0.0' } },
        'node_modules/a/node_modules/lodash': { version: '1.0.0' },
        'node_modules/b/node_modules/lodash': { version: '2.0.0' },
      },
    };
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '1.0.0' });
  });

  it('parses direct and transitive packages with depth and dev flags', () => {
    const payload = parseNpmLock(join(fixtureDir, 'package-lock.json'), join(fixtureDir, 'package.json'));

    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: true, isDev: false, depth: 0 });
    expect(byName.typescript).toMatchObject({ version: '5.4.5', isDirect: true, isDev: true, depth: 0 });
    // has-flag is in the lockfile but not reachable from root deps via the (empty) deps graph in this fixture
    expect(byName['has-flag']).toMatchObject({ isDirect: false, depth: null });
  });

  it('prefers the shallowest occurrence of a package regardless of alphabetical key order', () => {
    const payload = parseNpmLock(join(nestedFixtureDir, 'package-lock.json'), join(nestedFixtureDir, 'package.json'));

    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    // "node_modules/abc/node_modules/lodash" (depth 2) sorts before "node_modules/lodash" (depth 1)
    // alphabetically, but the shallower, top-level lodash entry must win.
    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: false });
  });

  it('reports packages resolved from a non-public registry as private', () => {
    const lock = {
      packages: {
        '': { dependencies: { lodash: '^4.17.21', '@acme/widget': '^1.0.0' } },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
        },
        'node_modules/@acme/widget': {
          version: '1.0.0',
          resolved: 'https://npm.corp.example/@acme/widget/-/widget-1.0.0.tgz',
        },
      },
    };
    const payload = parseNpmLock(writeTmp(JSON.stringify(lock)), '/nonexistent/package.json');
    expect(payload.privatePackages).toEqual(['@acme/widget']);
  });

  it('computes depth via BFS across a multi-hop transitive chain', () => {
    const payload = parseNpmLock(join(nestedFixtureDir, 'package-lock.json'), join(nestedFixtureDir, 'package.json'));

    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    // a (direct, depth 0) -> b (depth 1) -> c (depth 2)
    expect(byName.a).toMatchObject({ isDirect: true, depth: 0 });
    expect(byName.b).toMatchObject({ isDirect: false, depth: 1 });
    expect(byName.c).toMatchObject({ isDirect: false, depth: 2 });
  });
});

function writeTmp(content: string): string {
  return writeTmpNamed('package-lock.json', content);
}

function writeTmpNamed(fileName: string, content: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'npm-fixture-'));
  const path = join(tmp, fileName);
  writeFileSync(path, content);
  return path;
}
