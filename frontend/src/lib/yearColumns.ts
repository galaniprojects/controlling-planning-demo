/**
 * Shared utilities for year-based column grouping, elapsed month detection,
 * and month formatting. Used by collapsible year columns and monthly grids.
 */

/**
 * Fallback "present time" — used ONLY before GET /api/config resolves, or
 * in non-React contexts that cannot read ConfigContext. The authoritative
 * value is the backend's `current_period`, surfaced via ConfigContext
 * (`useConfig().currentPeriod`). React components MUST prefer the context
 * value; these constants exist so first paint and module-level derivations
 * have a sane default instead of undefined.
 *
 * ConfigProvider calls `setRuntimeConfig()` once the real config arrives,
 * keeping the mutable fallbacks below in sync for any helper invoked
 * outside React's render tree.
 */
function _ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Computed from the real date (not a hardcoded literal) so the pre-fetch
// default stays coherent in any month. Locked-current-month rule: the current
// month is in-progress; the open forecast month is the next one. (Date
// normalises month+1 across the year boundary.)
const _now = new Date();
export const FALLBACK_CURRENT_PERIOD = _ym(_now);
export const FALLBACK_OPEN_FORECAST_MONTH = _ym(
  new Date(_now.getFullYear(), _now.getMonth() + 1, 1),
);

// Mutable runtime mirror of the backend config. Seeded with the fallback
// literals; overwritten by ConfigProvider on first successful fetch. Read
// via `getRuntimeCurrentPeriod()` / `getRuntimeOpenForecastMonth()`.
let runtimeCurrentPeriod = FALLBACK_CURRENT_PERIOD;
let runtimeOpenForecastMonth = FALLBACK_OPEN_FORECAST_MONTH;

export function setRuntimeConfig(currentPeriod: string, openForecastMonth: string): void {
  runtimeCurrentPeriod = currentPeriod;
  runtimeOpenForecastMonth = openForecastMonth;
}

/** Best-effort current period for non-React contexts. Prefer useConfig() in components. */
export function getRuntimeCurrentPeriod(): string {
  return runtimeCurrentPeriod;
}

/** Best-effort open forecast month for non-React contexts. Prefer useConfig() in components. */
export function getRuntimeOpenForecastMonth(): string {
  return runtimeOpenForecastMonth;
}

/**
 * @deprecated Prefer `useConfig().currentPeriod` in React components, or
 * `getRuntimeCurrentPeriod()` in helpers. Retained as a getter shim so
 * legacy references keep compiling while consumers migrate.
 */
export const DEMO_DATE = FALLBACK_CURRENT_PERIOD;

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Group an array of "YYYY-MM" strings by year.
 * Returns a Map ordered by year ascending.
 */
export function groupMonthsByYear(months: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const sorted = [...months].sort();
  for (const m of sorted) {
    const year = parseInt(m.slice(0, 4), 10);
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(m);
  }
  return map;
}

/**
 * Returns true if the given "YYYY-MM" is strictly before the current
 * period. Elapsed months get subtle background tinting in grids.
 *
 * Pass the current period from `useConfig().currentPeriod`. The argument
 * is optional and falls back to the runtime config mirror for non-React
 * callers, but components should always pass the context value.
 */
export function isElapsedMonth(month: string, currentPeriod: string = runtimeCurrentPeriod): boolean {
  return month < currentPeriod;
}

/**
 * Returns true if the given "YYYY-MM" is an editable forecast month.
 *
 * LOCKED CURRENT MONTH rule: the in-progress current month is NOT
 * editable; the first editable month is `open_forecast_month` (the month
 * after the current period). So editability is `month >= openForecastMonth`.
 *
 * Pass the open forecast month from `useConfig().openForecastMonth`.
 */
export function isEditableMonth(
  month: string,
  openForecastMonth: string = runtimeOpenForecastMonth,
): boolean {
  return month >= openForecastMonth;
}

/**
 * Format "YYYY-MM" → short month name ("Jan", "Feb", etc.)
 */
export function formatMonthShort(month: string): string {
  const idx = parseInt(month.slice(5, 7), 10) - 1;
  return MONTH_SHORT[idx] ?? month;
}

/**
 * Returns true if the month string represents January (MM === "01").
 */
export function isJanuary(month: string): boolean {
  return month.slice(5, 7) === '01';
}

/**
 * Returns true if a column key represents the start of a year — either a
 * January monthly column ("YYYY-01") or a Q1 quarterly column ("YYYY-Q1").
 * Used by mixed-granularity grids to apply the year-boundary visual treatment
 * (heavier left border, bold/darker label).
 */
export function isYearStartColumnKey(key: string): boolean {
  if (key.length < 7) return false;
  const tail = key.slice(5);
  return tail === '01' || tail === 'Q1';
}

/**
 * Group an array of mixed-granularity column keys (mix of "YYYY-MM" and
 * "YYYY-QN") by year. Used by the mixed-granularity grid's collapsible
 * year columns. Synthesised "::expanded::" sub-keys are NOT expected here;
 * collapse logic operates on the canonical column list.
 */
export function groupMixedKeysByYear(keys: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const k of keys) {
    if (k.length < 4) continue;
    const year = parseInt(k.slice(0, 4), 10);
    if (Number.isNaN(year)) continue;
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(k);
  }
  // Preserve column order within each year (caller passes ordered keys).
  return new Map(Array.from(map.entries()).sort(([a], [b]) => a - b));
}

/**
 * Determine which year to expand by default based on project status.
 * - Running/active projects: current year (2026)
 * - Future projects (not yet started): starting year
 * - Completed projects: final year
 */
export function getDefaultExpandedYear(
  status: string | undefined,
  startMonth: string | null | undefined,
  endMonth: string | null | undefined,
  currentPeriod: string = runtimeCurrentPeriod,
): number {
  const currentYear = parseInt(currentPeriod.slice(0, 4), 10);
  if (status === 'completed' && endMonth) {
    return parseInt(endMonth.slice(0, 4), 10);
  }
  if ((status === 'planned' || status === 'pending_approval') && startMonth) {
    const startYear = parseInt(startMonth.slice(0, 4), 10);
    if (startYear > currentYear) return startYear;
  }
  return currentYear;
}
