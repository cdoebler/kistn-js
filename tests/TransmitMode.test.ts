import { describe, it, expect } from 'vitest';
import { TransmitMode, parseTransmitMode } from '../src/TransmitMode';

describe('parseTransmitMode', () => {
  it('parses known values', () => {
    expect(parseTransmitMode('always')).toBe(TransmitMode.Always);
    expect(parseTransmitMode('never')).toBe(TransmitMode.Never);
    expect(parseTransmitMode('on_demand')).toBe(TransmitMode.OnDemand);
  });

  it('defaults to Always for unknown/missing values', () => {
    expect(parseTransmitMode(undefined)).toBe(TransmitMode.Always);
    expect(parseTransmitMode('bogus')).toBe(TransmitMode.Always);
  });
});
