import { describe, it, expect } from 'vitest';
import { parseYarnClassicAuditNdjson } from '../../src/collectors/parseYarnClassicAuditNdjson';

describe('parseYarnClassicAuditNdjson', () => {
  it('extracts findings from auditAdvisory lines, ignoring other line types', () => {
    const ndjson = [
      JSON.stringify({ type: 'auditAdvisory', data: { advisory: { module_name: 'lodash', severity: 'high', url: 'https://github.com/advisories/GHSA-abcd-1234-efgh' } } }),
      JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { high: 1 } } }),
    ].join('\n');

    const findings = parseYarnClassicAuditNdjson(ndjson, { lodash: '4.17.20' });

    expect(findings).toEqual([
      { packageName: 'lodash', packageVersion: '4.17.20', advisoryId: 'GHSA-abcd-1234-efgh', severity: 'high' },
    ]);
  });

  it('returns empty array when output has no parseable lines', () => {
    expect(parseYarnClassicAuditNdjson('not json\nalso not json', {})).toEqual([]);
  });

  it('skips blank lines', () => {
    const ndjson = `\n${JSON.stringify({ type: 'auditSummary' })}\n\n`;
    expect(parseYarnClassicAuditNdjson(ndjson, {})).toEqual([]);
  });

  it('falls back to unknown name and the first CVE when module_name/url are missing or unmatched', () => {
    const ndjson = JSON.stringify({ type: 'auditAdvisory', data: { advisory: { severity: 'high', url: 'https://example.com/no-ghsa', cves: ['CVE-2024-4068'] } } });

    const findings = parseYarnClassicAuditNdjson(ndjson, {});

    expect(findings).toEqual([{ packageName: 'unknown', packageVersion: '*', advisoryId: 'CVE-2024-4068', severity: 'high' }]);
  });

  it('skips advisories without any identifier', () => {
    const ndjson = JSON.stringify({ type: 'auditAdvisory', data: { advisory: { module_name: 'braces', severity: 'high', url: 'https://example.com/no-ghsa' } } });

    expect(parseYarnClassicAuditNdjson(ndjson, {})).toEqual([]);
  });
});
