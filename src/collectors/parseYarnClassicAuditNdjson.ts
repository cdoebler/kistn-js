import { Finding } from '../dto/types';
import { normalizeSeverity } from './normalizeSeverity';

export function parseYarnClassicAuditNdjson(rawOutput: string, installedVersions: Record<string, string>): Finding[] {
  const findings: Finding[] = [];

  for (const line of rawOutput.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type !== 'auditAdvisory' || typeof parsed?.data?.advisory !== 'object') {
      continue;
    }

    const advisory = parsed.data.advisory;
    const name = typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown';
    const severity = normalizeSeverity(advisory.severity);
    const urlMatch = typeof advisory.url === 'string' ? advisory.url.match(/GHSA-[a-z0-9-]+/i) : null;

    findings.push({
      packageName: name,
      packageVersion: installedVersions[name] ?? '*',
      advisoryId: urlMatch ? urlMatch[0] : 'unknown',
      severity,
    });
  }

  return findings;
}
