/**
 * v5 B2 — Cell-level diff helpers shared between forecast surfaces.
 *
 * Extracted from `MixedGranularityGrid.tsx:226-244` per `[B-OQ-02]` so the
 * same delta-lookup + delta-indicator render logic powers:
 *   - `MixedGranularityGrid` (Workbench forecast tab + ForecastGridSurface)
 *   - `compare/LineLevelDetailLevel` (Compare L3 — T3)
 *   - `drawer/DiffEntry` (Change-summary drawer rows — T1)
 *
 * The functions here are pure (no React state, no API calls). They depend on
 * the `CellDelta` shape from `@/types/api` which v4 ships unchanged.
 */
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/formatters';
import type { CellDelta } from '@/types/api';

/**
 * Look up the delta for a cell keyed by `(category, sub_category, cell_key)`.
 * Returns undefined when no comparison overlay is active or no delta exists.
 *
 * The `deltaIndex` map is built upstream from the comparison response —
 * keys are joined as `${category}|${sub}|${cell_key}` to avoid nested maps.
 */
export function lookupDelta(
  deltaIndex: Map<string, CellDelta>,
  comparisonActive: boolean,
  category: string,
  sub: string,
  cellKey: string,
): CellDelta | undefined {
  if (!comparisonActive) return undefined;
  return deltaIndex.get(`${category}|${sub}|${cellKey}`);
}

/**
 * True when a delta represents a meaningful change (rounded above 1 cent).
 * Mirrors the threshold used by the original MixedGranularityGrid render.
 */
export function isMeaningfulDelta(delta: CellDelta | undefined): boolean {
  if (!delta) return false;
  if (delta.delta === null || delta.delta === undefined) return false;
  if (delta.status === 'unchanged') return false;
  return Math.abs(delta.delta) >= 0.005;
}

/**
 * Render the small ▲/▼ delta indicator with the EUR-formatted amount.
 * Returns `null` when the delta is missing or below the visibility threshold.
 *
 * Uses semantic colour classes per CLAUDE.md dark-mode rule: emerald for a
 * positive delta (cost up = unfavourable for cost-trim scenarios; the icon
 * conveys direction without implying sentiment), red for a negative delta.
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
