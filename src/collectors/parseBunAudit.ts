import { Finding } from '../dto/types';
import { advisoryIdOf } from './advisoryIdOf';
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

      const advisoryId = advisoryIdOf(advisory);
      if (advisoryId === null) {
        continue;
      }

      findings.push({
        packageName,
        packageVersion: installedVersions[packageName] ?? '*',
        advisoryId,
        severity: normalizeSeverity(advisory.severity),
      });
    }
  }

  return findings;
}
