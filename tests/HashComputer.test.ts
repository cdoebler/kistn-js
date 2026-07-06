import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { computeHash } from '../src/HashComputer';
import { createInventoryPayload, Package } from '../src/dto/types';

function pkg(overrides: Partial<Package>): Package {
  return { name: 'a', version: '1.0.0', ecosystem: 'npm', isDirect: true, isDev: false, depth: 0, ...overrides };
}

describe('computeHash', () => {
  it('is stable regardless of input order (sorts by name)', () => {
    const a = computeHash(createInventoryPayload([pkg({ name: 'zeta' }), pkg({ name: 'alpha' })]));
    const b = computeHash(createInventoryPayload([pkg({ name: 'alpha' }), pkg({ name: 'zeta' })]));
    expect(a).toBe(b);
  });

  it('matches manual sha256 of PHP-style-escaped sorted JSON', () => {
    const payload = createInventoryPayload([pkg({ name: 'lodash', version: '4.17.21', depth: 1 })]);
    const expectedJson = '[{"name":"lodash","version":"4.17.21","is_direct":true,"is_dev":false,"depth":1}]';
    const expected = createHash('sha256').update(expectedJson).digest('hex');
    expect(computeHash(payload)).toBe(expected);
  });

  it('escapes forward slashes like PHP json_encode', () => {
    const payload = createInventoryPayload([pkg({ name: 'a/b', version: '1.0.0' })]);
    const expectedJson = '[{"name":"a\\/b","version":"1.0.0","is_direct":true,"is_dev":false,"depth":0}]';
    const expected = createHash('sha256').update(expectedJson).digest('hex');
    expect(computeHash(payload)).toBe(expected);
  });

  it('keeps input order stable when two packages share the same name', () => {
    const a = computeHash(createInventoryPayload([pkg({ name: 'dup', version: '1.0.0' }), pkg({ name: 'dup', version: '2.0.0' })]));
    const b = computeHash(createInventoryPayload([pkg({ name: 'dup', version: '1.0.0' }), pkg({ name: 'dup', version: '2.0.0' })]));
    expect(a).toBe(b);
  });

  it('escapes non-ASCII code points as \\uXXXX like PHP json_encode', () => {
    const payload = createInventoryPayload([pkg({ name: 'café', version: '1.0.0' })]);
    const expectedJson = '[{"name":"caf\\u00e9","version":"1.0.0","is_direct":true,"is_dev":false,"depth":0}]';
    const expected = createHash('sha256').update(expectedJson).digest('hex');
    expect(computeHash(payload)).toBe(expected);
  });
});
