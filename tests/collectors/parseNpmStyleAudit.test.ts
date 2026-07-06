import { describe, it, expect } from 'vitest';
import { parseNpmStyleAudit } from '../../src/collectors/parseNpmStyleAudit';

describe('parseNpmStyleAudit', () => {
  it('extracts findings with GHSA id from via[].url', () => {
    const json = JSON.stringify({
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'high',
          via: [{ url: 'https://github.com/advisories/GHSA-abcd-1234-efgh', severity: 'high' }],
        },
      },
    });

    const findings = parseNpmStyleAudit(json, { lodash: '4.17.20' });

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.20', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'high' },
    ]);
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseNpmStyleAudit('not json', {})).toEqual([]);
  });

  it('returns empty array when vulnerabilities key is absent', () => {
    expect(parseNpmStyleAudit('{}', {})).toEqual([]);
  });

  it('returns empty array when the JSON is a non-object value', () => {
    expect(parseNpmStyleAudit('42', {})).toEqual([]);
  });

  it('skips vulnerability entries that are not objects', () => {
    const json = JSON.stringify({ vulnerabilities: { lodash: 'not-an-object' } });
    expect(parseNpmStyleAudit(json, {})).toEqual([]);
  });

  it('falls back to unknown advisoryId when via is not an array or has no GHSA url', () => {
    const json = JSON.stringify({
      vulnerabilities: {
        lodash: { name: 'lodash', severity: 'high', via: ['some-dependency-name'] },
      },
    });

    const findings = parseNpmStyleAudit(json, {});

    expect(findings).toEqual([{ packageName: 'lodash', packageVersion: '*', advisoryId: 'unknown', severity: 'high' }]);
  });

  it('falls back to the object key as name when vuln.name is missing', () => {
    const json = JSON.stringify({ vulnerabilities: { lodash: { severity: 'high' } } });

    const findings = parseNpmStyleAudit(json, {});

    expect(findings[0]).toMatchObject({ packageName: 'lodash' });
  });
});
