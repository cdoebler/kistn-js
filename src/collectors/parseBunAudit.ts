import { Finding } from '../dto/types';
import { normalizeSeverity } from './normalizeSeverity';

// bun audit --json outputs: { "<package-name>": [{ id, url, title, severity, ... }] }
// This is different from npm audit --json which uses { vulnerabilities: { ... } }
export function parseBunAudit(rawJson: string, installedVersions: Record<string, string>): Finding[] {
  let data: any;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [];
  }

  const findings: Finding[] = [];

  for (const [packageName, advisories] of Object.entries<any>(data)) {
    if (!Array.isArray(advisories)) {
      continue;
    }

    for (const advisory of advisories) {
      if (typeof advisory !== 'object' || advisory === null) {
        continue;
      }

      const severity = normalizeSeverity(advisory.severity);
      const advisoryId = extractAdvisoryId(advisory);

      findings.push({
        packageName,
        packageVersion: installedVersions[packageName] ?? '*',
        advisoryId,
        severity,
      });
    }
  }

  return findings;
}

function extractAdvisoryId(advisory: any): string {
  if (typeof advisory.url === 'string') {
    const match = advisory.url.match(/GHSA-[a-z0-9-]+/i);
    if (match) {
      return match[0];
    }
  }

  return 'unknown';
}
