/**
 * v5 B2 — Cell diff helpers extracted from
 * `frontend/src/modules/workbench/forecast/MixedGranularityGrid.tsx:226-244`.
 *
 * Shared by sandbox surfaces (T2), the impact dashboard's Compare
 * level-3 (T3), and the change-summary drawer (T1) so we don't
 * triplicate the lookup + delta-rendering logic.
 *
 * NOTE: T2 will refactor MixedGranularityGrid to import from here so
 * the workbench grid uses the same canonical implementation. Until
 * then, this file is the single source of truth for new code.
 */

import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/formatters';

export interface CellDelta {
  /** Numeric delta (scenario - anchor). May be 0; null when unavailable. */
  delta: number | null;
}

/** Build a stable cell key from category / sub-line / month identifier. */
export function cellKey(category: string, sub: string, key: string): string {
  return `${category}|${sub}|${key}`;
}

/**
 * Resolve a cell delta from a precomputed index.
 *
 * The index maps `cellKey(...)` to its numeric delta. When comparison
 * is inactive, surfaces should pass `comparisonActive=false` so the
 * lookup short-circuits.
 */
export function lookupDelta(
  deltaIndex: Map<string, CellDelta> | null | undefined,
  comparisonActive: boolean,
  category: string,
  sub: string,
  key: string,
): CellDelta | undefined {
  if (!comparisonActive || !deltaIndex) return undefined;
  return deltaIndex.get(cellKey(category, sub, key));
}

/**
 * Render a small inline +/- delta indicator with an icon.
 * Returns `null` when the delta is null, undefined, or |delta| < 0.005.
 *
 * Match the visual style from MixedGranularityGrid lines 226-244 so
 * grid + simulator surfaces look identical.
 */
export function renderDeltaIndicator(delta: number | null | undefined): ReactNode {
  if (delta === null || delta === undefined) return null;
  if (Math.abs(delta) < 0.005) return null;
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-tabular font-medium ${
        positive
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-red-700 dark:text-red-400'
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {positive ? '+' : ''}
      {formatCurrencyCompact(delta)}
    </span>
  );
}
