import { describe, expect, it } from 'vitest';
import { normalizeSeverity } from '../../src/collectors/normalizeSeverity';

describe('normalizeSeverity', () => {
  it('passes through values already in the server enum', () => {
    expect(normalizeSeverity('low')).toBe('low');
    expect(normalizeSeverity('medium')).toBe('medium');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('critical')).toBe('critical');
  });

  it('maps npm/yarn/pnpm/bun "moderate" to "medium"', () => {
    expect(normalizeSeverity('moderate')).toBe('medium');
  });

  it('falls back to "low" for unrecognized or missing values', () => {
    expect(normalizeSeverity('info')).toBe('low');
    expect(normalizeSeverity('unknown')).toBe('low');
    expect(normalizeSeverity(undefined)).toBe('low');
  });
});
