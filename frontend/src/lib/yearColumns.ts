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
