/**
 * Shared utilities for year-based column grouping, elapsed month detection,
 * and month formatting. Used by collapsible year columns and monthly grids.
 */

const DEMO_DATE = '2026-04';

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
 * Returns true if the given "YYYY-MM" is strictly before the demo date (April 2026).
 * Elapsed months get subtle background tinting in grids.
 */
export function isElapsedMonth(month: string): boolean {
  return month < DEMO_DATE;
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
const CURRENT_YEAR = 2026;

export function getDefaultExpandedYear(
  status: string | undefined,
  startMonth: string | null | undefined,
  endMonth: string | null | undefined,
): number {
  if (status === 'completed' && endMonth) {
    return parseInt(endMonth.slice(0, 4), 10);
  }
  if ((status === 'planned' || status === 'pending_approval') && startMonth) {
    const startYear = parseInt(startMonth.slice(0, 4), 10);
    if (startYear > CURRENT_YEAR) return startYear;
  }
  return CURRENT_YEAR;
}
