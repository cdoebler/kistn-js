import { describe, it, expect } from 'vitest';
import { createInventoryPayload } from '../../src/dto/types';

describe('createInventoryPayload', () => {
  it('defaults findings and privatePackages to empty arrays', () => {
    const payload = createInventoryPayload([{ name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, isDev: false, depth: 0, availableVersion: null }]);
    expect(payload.findings).toEqual([]);
    expect(payload.privatePackages).toEqual([]);
    expect(payload.packages).toHaveLength(1);
  });

  it('passes through explicit findings and privatePackages unchanged', () => {
    const findings = [
      { packageName: 'lodash', packageVersion: '4.17.21', advisoryId: 'GHSA-1234', severity: 'high' },
    ];
    const privatePackages = ['my-private-plugin'];

    const payload = createInventoryPayload(
      [{ name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, isDev: false, depth: 0, availableVersion: null }],
      findings,
      privatePackages,
    );

    expect(payload.findings).toEqual(findings);
    expect(payload.privatePackages).toEqual(privatePackages);
  });
});
