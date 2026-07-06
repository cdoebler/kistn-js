import { Finding } from '../dto/types';
import { normalizeSeverity } from './normalizeSeverity';

export function parsePnpmAudit(rawJson: string, installedVersions: Record<string, string>): Finding[] {
  let data: any;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (typeof data !== 'object' || data === null || typeof data.advisories !== 'object' || data.advisories === null) {
    return [];
  }

  const findings: Finding[] = [];

  for (const advisory of Object.values<any>(data.advisories)) {
    if (typeof advisory !== 'object' || advisory === null) {
      continue;
    }

    const name: string = typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown';
    const severity = normalizeSeverity(advisory.severity);
    const advisoryId = extractAdvisoryId(advisory);

    findings.push({
      packageName: name,
      packageVersion: installedVersions[name] ?? '*',
      advisoryId,
      severity,
    });
  }

  return findings;
}

function extractAdvisoryId(advisory: any): string {
  if (typeof advisory.github_advisory_id === 'string' && advisory.github_advisory_id.length > 0) {
    return advisory.github_advisory_id;
  }

  if (typeof advisory.url === 'string') {
    const match = advisory.url.match(/GHSA-[a-z0-9-]+/i);
    if (match) {
      return match[0];
    }
  }

  return 'unknown';
}
