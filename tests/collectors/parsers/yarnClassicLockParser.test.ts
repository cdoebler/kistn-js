import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseYarnClassicLock } from '../../../src/collectors/parsers/yarnClassicLockParser';
import { InventoryError } from '../../../src/InventoryError';

const fixtureDir = join(__dirname, '../../fixtures/yarn-classic');

describe('parseYarnClassicLock', () => {
  it('throws InventoryError when yarn.lock does not exist', () => {
    expect(() => parseYarnClassicLock('/nonexistent/yarn.lock', join(fixtureDir, 'package.json'))).toThrow(
      InventoryError,
    );
  });

  it('throws InventoryError on an unresolved merge conflict', () => {
    const bad = '<<<<<<< HEAD\nnot: valid: yarn: syntax {{{\n=======\nalso ::: bad ###\n>>>>>>> branch\n';
    expect(() => parseYarnClassicLock(writeTmp(bad), join(fixtureDir, 'package.json'))).toThrow(InventoryError);
  });

  it('skips entries with no resolvable name or version', () => {
    const lock = 'unversioned-entry@^1.0.0:\n  resolution "unversioned-entry@^1.0.0"\n';
    const payload = parseYarnClassicLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    expect(payload.packages).toEqual([]);
  });

  it('keeps the first-seen version when two transitive-only entries conflict and neither matches a direct range', () => {
    const lock = [
      'transitive-thing@^1.0.0:',
      '  version "1.0.0"',
      '',
      'transitive-thing@^2.0.0:',
      '  version "2.0.0"',
      '',
    ].join('\n');
    const payload = parseYarnClassicLock(writeTmp(lock), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName['transitive-thing']).toMatchObject({ version: '1.0.0' });
  });

  it('parses direct deps, transitive deps, and BFS depth', () => {
    const payload = parseYarnClassicLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName.lodash).toMatchObject({ version: '4.17.21', isDirect: true, isDev: false, depth: 0 });
    expect(byName.typescript).toMatchObject({ version: '5.4.5', isDirect: true, isDev: true, depth: 0 });
    expect(byName['has-flag']).toMatchObject({ version: '4.0.0', isDirect: false, isDev: false, depth: 1 });
  });

  it('correctly extracts name/version from scoped package keys', () => {
    const payload = parseYarnClassicLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    expect(byName['@babel/core']).toMatchObject({ version: '7.24.0', isDirect: true, isDev: false, depth: 0 });
  });

  it('reports packages resolved from a non-public registry as private', () => {
    const lock = [
      '# yarn lockfile v1',
      '',
      'lodash@^4.17.21:',
      '  version "4.17.21"',
      '  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz#abc"',
      '',
      '"@acme/widget@^1.0.0":',
      '  version "1.0.0"',
      '  resolved "https://npm.corp.example/@acme/widget/-/widget-1.0.0.tgz#def"',
      '',
    ].join('\n');
    const payload = parseYarnClassicLock(writeTmp(lock), '/nonexistent/package.json');
    expect(payload.privatePackages).toEqual(['@acme/widget']);
  });

  it('resolves conflicting top-level versions in favor of the direct dependency range, regardless of file order', () => {
    const payload = parseYarnClassicLock(join(fixtureDir, 'yarn.lock'), join(fixtureDir, 'package.json'));
    const byName = Object.fromEntries(payload.packages.map((p) => [p.name, p]));

    // yarn.lock lists semver@^6.3.1 (transitive-only) before semver@^7.6.0 (matches the
    // package.json direct range) — the direct-matching entry must win despite being second.
    expect(byName.semver).toMatchObject({ version: '7.6.0', isDirect: true, isDev: false, depth: 0 });
  });
});

function writeTmp(content: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'yarn-classic-fixture-'));
  const path = join(tmp, 'yarn.lock');
  writeFileSync(path, content);
  return path;
}
