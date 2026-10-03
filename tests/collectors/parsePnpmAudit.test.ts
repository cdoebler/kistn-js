import { describe, it, expect } from 'vitest';
import { parsePnpmAudit } from '../../src/collectors/parsePnpmAudit';

describe('parsePnpmAudit', () => {
  it('extracts module_name, severity, and github_advisory_id from a realistic advisories payload', () => {
    const rawJson = JSON.stringify({
      actions: [],
      advisories: {
        '1065': {
          module_name: 'lodash',
          severity: 'high',
          github_advisory_id: 'GHSA-p6mc-m468-83gw',
          url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
        },
        '1179': {
          module_name: 'minimist',
          severity: 'critical',
          github_advisory_id: 'GHSA-vh95-rmgr-6w4m',
        },
      },
      metadata: {},
    });

    const findings = parsePnpmAudit(rawJson, { lodash: '4.17.15', minimist: '0.0.8' });

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.15', advisoryId: 'GHSA-p6mc-m468-83gw', severity: 'high' },
      { packageName: 'minimist', packageVersion: '0.0.8', advisoryId: 'GHSA-vh95-rmgr-6w4m', severity: 'critical' },
    ]);
  });

  it('falls back to scanning the url field when github_advisory_id is missing', () => {
    const rawJson = JSON.stringify({
      advisories: {
        '42': {
          module_name: 'lodash',
          severity: 'moderate',
          url: 'https://github.com/advisories/GHSA-abcd-1234-efgh',
        },
      },
    });

    const findings = parsePnpmAudit(rawJson, {});

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '*', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'medium' },
    ]);
  });

  it('falls back to the npm advisory id when neither github_advisory_id nor a matching url is present', () => {
    const rawJson = JSON.stringify({
      advisories: {
        '1': { id: 1096410, module_name: 'lodash', severity: 'low' },
      },
    });

    const findings = parsePnpmAudit(rawJson, {});

    expect(findings).toEqual([{ packageName: 'lodash', packageVersion: '*', advisoryId: 'NPM-1096410', severity: 'low' }]);
  });

  it('skips advisories without any identifier', () => {
    const rawJson = JSON.stringify({ advisories: { '1': { module_name: 'lodash', severity: 'low' } } });

    expect(parsePnpmAudit(rawJson, {})).toEqual([]);
  });

  it('returns an empty array for malformed JSON', () => {
    expect(parsePnpmAudit('{not valid json', {})).toEqual([]);
  });

  it('returns an empty array when the advisories key is missing', () => {
    expect(parsePnpmAudit(JSON.stringify({ actions: [], metadata: {} }), {})).toEqual([]);
  });

  it('returns an empty array when advisories is not an object', () => {
    expect(parsePnpmAudit(JSON.stringify({ advisories: null }), {})).toEqual([]);
  });

  it('skips malformed advisory entries', () => {
    const rawJson = JSON.stringify({
      advisories: {
        '1': null,
        '2': 'not-an-object',
      },
    });

    expect(parsePnpmAudit(rawJson, {})).toEqual([]);
  });
});
