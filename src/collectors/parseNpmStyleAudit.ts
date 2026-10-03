import { Finding } from '../dto/types';
import { advisoryIdOf } from './advisoryIdOf';
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
    if (typeof vuln !== 'object' || vuln === null || !Array.isArray(vuln.via)) {
      continue;
    }

    const name: string = typeof vuln.name === 'string' ? vuln.name : key;

    // String `via` entries only name a vulnerable dependency ("Depends on vulnerable versions of X");
    // that dependency is reported with its own advisory, so they are not findings of this package.
    for (const item of vuln.via) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }

      const advisoryId = advisoryIdOf(item);
      if (advisoryId === null) {
        continue;
      }

      findings.push({
        packageName: name,
        packageVersion: installedVersions[name] ?? '*',
        advisoryId,
        severity: normalizeSeverity(item.severity ?? vuln.severity),
      });
    }
  }

  return findings;
}
