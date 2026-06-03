/**
 * Project-scope Session 2 — quarterly fan-out maths (PURE).
 *
 * Extracted from `workbench/forecast/Phase3EditForecast.tsx` (its copy is
 * module-private) so the editable scenario grid can reuse the exact same
 * equal-thirds + cent-remainder distribution rule per [C-FG-03]. Keeping a
 * single tested copy here means the simulator and the workbench never drift.
 */

/** 'YYYY-QN' → ['YYYY-MM', 'YYYY-MM', 'YYYY-MM']. */
export function quarterMonths(qKey: string): string[] {
  const year = parseInt(qKey.slice(0, 4), 10);
  const qNum = parseInt(qKey.slice(6), 10);
  const startMonth = (qNum - 1) * 3 + 1;
  return [0, 1, 2].map(
    (i) => `${year}-${String(startMonth + i).padStart(2, '0')}`,
  );
}

/**
 * Distribute a quarterly aggregate equally across its months. Cent remainder
 * lands on the last month per [C-FG-03]. The sum of the returned values equals
 * `total` (to cent precision).
 */
export function distributeQuarterly(
  total: number,
  months: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const n = months.length;
  if (n === 0) return out;
  const base = Math.floor((total * 100) / n) / 100;
  for (let i = 0; i < n - 1; i += 1) out.set(months[i], base);
  const allocated = base * (n - 1);
  out.set(months[n - 1], Math.round((total - allocated) * 100) / 100);
  return out;
}
