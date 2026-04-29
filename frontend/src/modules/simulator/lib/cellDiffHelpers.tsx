/**
 * v5 B2 — Cell-level diff helpers shared between forecast surfaces.
 *
 * Extracted from `MixedGranularityGrid.tsx:226-244` per `[B-OQ-02]` so the
 * same delta-lookup + delta-indicator render logic powers:
 *   - `MixedGranularityGrid` (Workbench forecast tab + ForecastGridSurface)
 *   - `compare/LineLevelDetailLevel` (Compare L3 — T3)
 *   - `drawer/DiffEntry` (Change-summary drawer rows — T1)
 *   - sandbox surfaces (T2)
 *
 * The functions here are pure (no React state, no API calls). `CellDelta`
 * is the canonical comparison shape from `@/types/api` (delta + status).
 */
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/formatters';
import type { CellDelta } from '@/types/api';

/** Build a stable cell key from category / sub-line / month identifier. */
export function cellKey(category: string, sub: string, key: string): string {
  return `${category}|${sub}|${key}`;
}

/**
 * Look up the delta for a cell keyed by `(category, sub, key)`.
 * Returns undefined when no comparison overlay is active or no delta exists.
 *
 * Accepts a nullable Map so callers can pass `comparisonActive=false` and
 * a null index without an extra null guard.
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
 * Direction conveyed via icon + sign prefix, never colour-only (accessibility).
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
