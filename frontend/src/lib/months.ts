/**
 * Month-string helpers for `YYYY-MM` inputs (the format used by all
 * backend month columns: baseline, forecast, actuals, etc.).
 *
 * The Define page's Financials baseline grid uses these to derive the
 * editable month columns from a project's `start_month` / `end_month`.
 *
 * Note: `frontend/src/modules/capacity/timeline/timeAxis.ts` exports
 * its own `generateMonthRange` + `addMonths` with the same semantics —
 * those should eventually move here so there's one canonical
 * implementation. Tracked as a refactor opportunity; not in this
 * commit's scope.
 */

function parseMonth(month: string): { year: number; m0: number } {
  const [yStr, mStr] = month.split('-');
  return { year: parseInt(yStr, 10), m0: parseInt(mStr, 10) - 1 };
}

function fmtMonth(year: number, m0: number): string {
  return `${year}-${String(m0 + 1).padStart(2, '0')}`;
}

/**
 * Inclusive month range from `start` (YYYY-MM) to `end` (YYYY-MM).
 *
 * @example monthsBetween('2026-04', '2026-06') // ['2026-04', '2026-05', '2026-06']
 *
 * Returns `[start]` when end < start (degenerate range — defensive,
 * so callers always get at least one column to render).
 */
export function monthsBetween(start: string, end: string): string[] {
  const a = parseMonth(start);
  const b = parseMonth(end);
  if (b.year < a.year || (b.year === a.year && b.m0 < a.m0)) {
    return [start];
  }
  const months: string[] = [];
  let { year, m0 } = a;
  while (year < b.year || (year === b.year && m0 <= b.m0)) {
    months.push(fmtMonth(year, m0));
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      year += 1;
    }
  }
  return months;
}

/**
 * Shift a YYYY-MM by `n` months (positive or negative). Used by the
 * Define Financials tab to fall back to `start_month + 12` when a
 * project has no `end_month` (services / open-ended planning).
 *
 * @example addMonths('2026-04', 12) // '2027-04'
 */
export function addMonths(month: string, n: number): string {
  const { year, m0 } = parseMonth(month);
  const total = year * 12 + m0 + n;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return fmtMonth(ny, nm);
}
