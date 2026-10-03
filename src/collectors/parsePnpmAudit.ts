import { Finding } from '../dto/types';
import { advisoryIdOf } from './advisoryIdOf';
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

    const advisoryId = advisoryIdOf(advisory);
    if (advisoryId === null) {
      continue;
    }

    const name: string = typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown';

    findings.push({
      packageName: name,
      packageVersion: installedVersions[name] ?? '*',
      advisoryId,
      severity: normalizeSeverity(advisory.severity),
    });
  }

  return findings;
}
