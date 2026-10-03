import { describe, it, expect } from 'vitest';
import { parseBunAudit } from '../../src/collectors/parseBunAudit';

describe('parseBunAudit', () => {
  it('extracts package name, severity, and GHSA id from a realistic bun audit payload', () => {
    // bun audit --json outputs { "<package-name>": [{ id, url, title, severity, ... }] }
    const rawJson = JSON.stringify({
      lodash: [
        {
          id: 1106913,
          url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
          title: 'Command Injection in lodash',
          severity: 'high',
          vulnerable_versions: '<4.17.21',
          cwe: ['CWE-77', 'CWE-94'],
        },
        {
          id: 1108258,
          url: 'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
          title: 'Regular Expression Denial of Service (ReDoS) in lodash',
          severity: 'moderate',
          vulnerable_versions: '>=4.0.0 <4.17.21',
          cwe: ['CWE-400'],
        },
      ],
    });

    const findings = parseBunAudit(rawJson, { lodash: '4.17.20' });

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.20', advisoryId: 'GHSA-35jh-r3h4-6jhm', severity: 'high' },
      { packageName: 'lodash', packageVersion: '4.17.20', advisoryId: 'GHSA-29mw-wpgm-hmr9', severity: 'medium' },
    ]);
  });

  it('handles multiple packages in one audit result', () => {
    const rawJson = JSON.stringify({
      lodash: [
        {
          id: 1,
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
          severity: 'high',
        },
      ],
      minimist: [
        {
          id: 2,
          url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff',
          severity: 'critical',
        },
      ],
    });

    const findings = parseBunAudit(rawJson, { lodash: '4.17.15', minimist: '0.0.8' });

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ packageName: 'lodash', packageVersion: '4.17.15', severity: 'high' });
    expect(findings[1]).toMatchObject({ packageName: 'minimist', packageVersion: '0.0.8', severity: 'critical' });
  });

  it('falls back to the npm advisory id when url contains no GHSA id', () => {
    const rawJson = JSON.stringify({
      lodash: [{ id: 1, url: 'https://example.com/no-ghsa', severity: 'low' }],
    });

    const findings = parseBunAudit(rawJson, {});

    expect(findings).toEqual([{ packageName: 'lodash', packageVersion: '*', advisoryId: 'NPM-1', severity: 'low' }]);
  });

  it('skips advisories without any identifier', () => {
    const rawJson = JSON.stringify({
      lodash: [{ url: 'https://example.com/no-ghsa', severity: 'low' }],
    });

    expect(parseBunAudit(rawJson, {})).toEqual([]);
  });

  it('falls back to low severity when severity field is missing', () => {
    const rawJson = JSON.stringify({
      lodash: [{ id: 1, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
    });

    const findings = parseBunAudit(rawJson, { lodash: '4.17.20' });

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.20', advisoryId: 'GHSA-aaaa-bbbb-cccc', severity: 'low' },
    ]);
  });

  it('uses * as packageVersion when package is not in installedVersions', () => {
    const rawJson = JSON.stringify({
      lodash: [{ id: 1, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high' }],
    });

    const findings = parseBunAudit(rawJson, {});

    expect(findings[0].packageVersion).toBe('*');
  });

  it('returns an empty array for malformed JSON', () => {
    expect(parseBunAudit('{not valid json', {})).toEqual([]);
  });

  it('returns an empty array when output is empty object (no vulnerabilities)', () => {
    expect(parseBunAudit('{}', {})).toEqual([]);
  });

  it('returns an empty array when output is an array instead of object', () => {
    expect(parseBunAudit('[]', {})).toEqual([]);
  });

  it('skips entries where the advisory list is not an array', () => {
    const rawJson = JSON.stringify({
      lodash: 'not-an-array',
      minimist: [{ id: 1, url: 'https://github.com/advisories/GHSA-dddd-eeee-ffff', severity: 'high' }],
    });

    const findings = parseBunAudit(rawJson, { minimist: '0.0.8' });

    expect(findings).toHaveLength(1);
    expect(findings[0].packageName).toBe('minimist');
  });

  it('skips malformed advisory entries within a valid package list', () => {
    const rawJson = JSON.stringify({
      lodash: [
        null,
        'not-an-object',
        { id: 1, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high' },
      ],
    });

    const findings = parseBunAudit(rawJson, { lodash: '4.17.20' });

    expect(findings).toHaveLength(1);
    expect(findings[0].advisoryId).toBe('GHSA-aaaa-bbbb-cccc');
  });
});
