/**
 * Flat salary computation helpers (Phase 7b). The salary structure stores
 * allowances/deductions as component maps: `{ housing: { amount }, transport: { amount } }`.
 * "Flat" here means each component contributes a fixed amount (no percentages,
 * no paid-time-off math) — monthly payroll = basic + flat allowances − flat deductions.
 */

/** Flat amount from a component entry: a number, numeric string, or `{ amount }`. */
export function flatAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('amount' in obj) return flatAmount(obj.amount);
    if ('value' in obj) return flatAmount(obj.value);
  }
  return 0;
}

/** Sum of the flat amounts across a component map (e.g. `{ housing: {...}, transport: {...} }`). */
export function flatTotal(components: Record<string, unknown> | null | undefined): number {
  if (!components) return 0;
  let total = 0;
  for (const value of Object.values(components)) {
    total += flatAmount(value);
  }
  return total;
}

/** `PR-YYYY-MM` run number derived from the period start in UTC (immutable on reversal). */
export function payrollRunNumber(periodStart: Date): string {
  const yyyy = periodStart.getUTCFullYear();
  const mm = String(periodStart.getUTCMonth() + 1).padStart(2, '0');
  return `PR-${yyyy}-${mm}`;
}