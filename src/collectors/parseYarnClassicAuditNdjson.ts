import { Finding } from '../dto/types';
import { advisoryIdOf } from './advisoryIdOf';
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
    const advisoryId = advisoryIdOf(advisory);
    if (advisoryId === null) {
      continue;
    }

    const name = typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown';

    findings.push({
      packageName: name,
      packageVersion: installedVersions[name] ?? '*',
      advisoryId,
      severity: normalizeSeverity(advisory.severity),
    });
  }

  return findings;
}
