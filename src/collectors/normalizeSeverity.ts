/**
 * Server only accepts SeverityEnum {low, medium, high, critical} (see kistn
 * StoreProjectInventoryRequest). npm/yarn/pnpm/bun audit report 'moderate'
 * (and sometimes 'info' or omit severity entirely), which the server 422s on
 * verbatim — collapse anything outside the enum to the nearest valid value.
 */
export function normalizeSeverity(raw: unknown): string {
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') {
    return raw;
  }
  if (raw === 'moderate') {
    return 'medium';
  }
  return 'low';
}
