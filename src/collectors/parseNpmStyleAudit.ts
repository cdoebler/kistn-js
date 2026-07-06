import { Finding } from '../dto/types';
import { normalizeSeverity } from './normalizeSeverity';

export function parseNpmStyleAudit(rawJson: string, installedVersions: Record<string, string>): Finding[] {
  let data: any;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (typeof data !== 'object' || data === null || typeof data.vulnerabilities !== 'object' || data.vulnerabilities === null) {
    return [];
  }

  const findings: Finding[] = [];

  for (const [key, vuln] of Object.entries<any>(data.vulnerabilities)) {
    if (typeof vuln !== 'object' || vuln === null) {
      continue;
    }

    const name: string = typeof vuln.name === 'string' ? vuln.name : key;
    const severity = normalizeSeverity(vuln.severity);
    const advisoryId = extractAdvisoryId(vuln.via);

    findings.push({
      packageName: name,
      packageVersion: installedVersions[name] ?? '*',
      advisoryId,
      severity,
    });
  }

  return findings;
}

function extractAdvisoryId(via: unknown): string {
  if (!Array.isArray(via)) {
    return 'unknown';
  }

  for (const item of via) {
    if (typeof item === 'object' && item !== null && typeof item.url === 'string') {
      const match = item.url.match(/GHSA-[a-z0-9-]+/i);
      if (match) {
        return match[0];
      }
    }
  }

  return 'unknown';
}
