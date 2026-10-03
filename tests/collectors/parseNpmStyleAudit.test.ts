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

  it('reports only the vulnerable package, not the packages that merely depend on it', () => {
    const json = JSON.stringify({
      vulnerabilities: {
        braces: {
          name: 'braces',
          severity: 'high',
          via: [{ source: 1112345, url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', severity: 'high' }],
        },
        micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] },
        'fast-glob': { name: 'fast-glob', severity: 'high', via: ['micromatch'] },
        'eslint-config-next': { name: 'eslint-config-next', severity: 'high', via: ['@next/eslint-plugin-next'] },
      },
    });

    const findings = parseNpmStyleAudit(json, { braces: '3.0.3', micromatch: '4.0.8', 'fast-glob': '3.3.1' });

    expect(findings).toEqual([
      { packageName: 'braces', packageVersion: '3.0.3', advisoryId: 'GHSA-vfj7-8cjw-p6xm', severity: 'high' },
    ]);
  });

  it('reports every advisory of a package, each with its own severity', () => {
    const json = JSON.stringify({
      vulnerabilities: {
        lodash: {
          name: 'lodash',
          severity: 'critical',
          via: [
            { url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'moderate' },
            'some-dependency',
            { source: 1096410, url: 'https://example.com/no-ghsa', severity: 'critical' },
            { url: 'https://example.com/no-id', severity: 'low' },
          ],
        },
      },
    });

    expect(parseNpmStyleAudit(json, {})).toEqual([
      { packageName: 'lodash', packageVersion: '*', advisoryId: 'GHSA-aaaa-bbbb-cccc', severity: 'medium' },
      { packageName: 'lodash', packageVersion: '*', advisoryId: 'NPM-1096410', severity: 'critical' },
    ]);
  });

  it('falls back to the object key as name when vuln.name is missing', () => {
    const json = JSON.stringify({
      vulnerabilities: { lodash: { severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-abcd-1234-efgh' }] } },
    });

    const findings = parseNpmStyleAudit(json, {});

    expect(findings[0]).toMatchObject({ packageName: 'lodash', severity: 'high' });
  });

  it('skips entries whose via is not an array', () => {
    const json = JSON.stringify({ vulnerabilities: { lodash: { name: 'lodash', severity: 'high' } } });

    expect(parseNpmStyleAudit(json, {})).toEqual([]);
  });
});
