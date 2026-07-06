import { describe, it, expect } from 'vitest';
import { isPrivateSource, privateNames } from '../../src/collectors/isPrivateSource';

describe('isPrivateSource', () => {
  it('treats an absent/empty source as public (default registry)', () => {
    expect(isPrivateSource(undefined)).toBe(false);
    expect(isPrivateSource(null)).toBe(false);
    expect(isPrivateSource('')).toBe(false);
  });

  it('treats the public npm/yarn registries as public', () => {
    expect(isPrivateSource('https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz')).toBe(false);
    expect(isPrivateSource('https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz')).toBe(false);
  });

  it('treats enterprise registries, git remotes and tarballs as private', () => {
    expect(isPrivateSource('https://npm.corp.example/@acme/widget/-/widget-1.0.0.tgz')).toBe(true);
    expect(isPrivateSource('git+ssh://git@github.com/acme/widget.git#abc123')).toBe(true);
    expect(isPrivateSource('https://example.com/tarballs/widget.tgz')).toBe(true);
  });
});

describe('privateNames', () => {
  it('returns the sorted names of entries with a private source', () => {
    const entries = new Map<string, { source?: string }>([
      ['zeta', { source: 'https://npm.corp.example/zeta/-/zeta-1.0.0.tgz' }],
      ['public-pkg', { source: 'https://registry.npmjs.org/public-pkg/-/public-pkg-1.0.0.tgz' }],
      ['alpha', { source: 'git+https://github.com/acme/alpha.git' }],
      ['no-source', {}],
    ]);
    expect(privateNames(entries)).toEqual(['alpha', 'zeta']);
  });
});
