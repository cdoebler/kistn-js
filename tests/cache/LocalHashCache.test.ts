import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalHashCache } from '../../src/cache/LocalHashCache';

describe('LocalHashCache', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inv-cache-'));
    path = join(dir, '.inventory.hash');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no cache file exists', () => {
    const cache = new LocalHashCache(path);
    expect(cache.get('npm')).toBeNull();
  });

  it('stores and retrieves a hash per ecosystem', () => {
    const cache = new LocalHashCache(path);
    cache.set('npm', 'abc123');
    const reloaded = new LocalHashCache(path);
    expect(reloaded.get('npm')).toBe('abc123');
    expect(reloaded.get('composer')).toBeNull();
  });

  it('treats malformed JSON as an empty cache', () => {
    writeFileSync(path, 'not valid json {{{', 'utf8');
    const cache = new LocalHashCache(path);
    expect(cache.get('npm')).toBeNull();
  });

  it('treats a non-object JSON value as an empty cache', () => {
    writeFileSync(path, '42', 'utf8');
    const cache = new LocalHashCache(path);
    expect(cache.get('npm')).toBeNull();
  });
});
