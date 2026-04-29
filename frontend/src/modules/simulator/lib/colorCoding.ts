/**
 * v5 B2 — Color-coding shell.
 *
 * T3 fills this with the Compare view's per-scenario column color
 * coding helpers (positive / negative deltas, threshold buckets).
 * Lives in T1's lib so other modules can import without depending on
 * compare/.
 */

export const POSITIVE_DELTA_CLASS =
  'text-emerald-700 dark:text-emerald-400';
export const NEGATIVE_DELTA_CLASS =
  'text-red-700 dark:text-red-400';
export const NEUTRAL_DELTA_CLASS = 'text-muted-foreground';

export function deltaColor(delta: number | null | undefined): string {
  if (delta == null || Math.abs(delta) < 0.005) return NEUTRAL_DELTA_CLASS;
  return delta > 0 ? POSITIVE_DELTA_CLASS : NEGATIVE_DELTA_CLASS;
}
