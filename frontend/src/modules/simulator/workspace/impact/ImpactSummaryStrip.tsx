/**
 * Zone 2 — Impact summary strip per spec line 1074.
 *
 * Eight compact tiles, one per impact dimension, always visible. Click to
 * expand the detail panel below the strip (only one open at a time).
 *
 * Tiers / redactions:
 *   - People tile (Tier 3) is removed entirely from the strip when
 *     `tier3Visible === false` per CLAUDE.md (not greyed — hidden).
 *   - The cost-allocation tile is always rendered when the impact response
 *     includes a `cost_allocation` sub-section (Lever 12 overlay).
 *
 * Recalculation model: this component does NOT trigger recalc — the
 * Recalculate button lives in T1's ScenarioHeader. We just render whatever
 * the impact response currently holds, with a `stale` indicator on tiles
 * when the user has edited since the last recalc (matches spec line 1048).
 *
 * Change Summary (dimension 8) updates real-time without a recalc — the
 * impact response carries it on every read, and T1's mutations bump the
 * scenario's modified_at timestamp which clears stale via the recalc hook.
 */

import { useState } from 'react';
import { ImpactTile } from './ImpactTile';
import { ImpactDetailPanel } from './ImpactDetailPanel';
import {
  DIMENSION_DISPLAY_ORDER,
  DIMENSION_META,
  type DimensionKey,
  type ImpactDashboardResponse,
} from '../../lib/impactTypes';
import { headlineForDimension } from '../../lib/dimensionHeadlines';

interface ImpactSummaryStripProps {
  impact: ImpactDashboardResponse | null;
  loading: boolean;
  /** Drives stale dot rendering on each tile per spec line 1048. */
  stale: boolean;
  /** Tier 3 user flag. False → People tile hidden entirely. */
  tier3Visible: boolean;
}

export function ImpactSummaryStrip({
  impact,
  loading,
  stale,
  tier3Visible,
}: ImpactSummaryStripProps) {
  const [openKey, setOpenKey] = useState<DimensionKey | null>(null);

  const handleToggle = (key: DimensionKey) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  if (loading && !impact) {
    return (
      <div
        data-testid="impact-strip-loading"
        className="flex flex-wrap gap-2 px-4 py-3 bg-card/40 border-y border-border"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[160px] h-14 rounded-md bg-muted/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!impact) {
    return (
      <div
        data-testid="impact-strip-empty"
        className="px-4 py-6 bg-card/40 border-y border-border text-sm text-muted-foreground"
      >
        Impact dashboard unavailable. Apply a change or click Recalculate.
      </div>
    );
  }

  const dims = impact.dimensions;
  const dimensionOrder = DIMENSION_DISPLAY_ORDER.filter((key) => {
    if (key === 'people' && !tier3Visible) return false;
    // Cost allocation tile only shown if the backend returned the section
    // (Lever-12 sub-section is conditionally added per ImpactDashboardResponse).
    if (key === 'cost_allocation' && !dims.cost_allocation) return false;
    return true;
  });

  return (
    <div
      data-testid="impact-strip"
      className="bg-card/40 border-y border-border"
    >
      <div className="flex flex-wrap items-stretch gap-2 px-4 py-3">
        {dimensionOrder.map((key) => {
          const meta = DIMENSION_META[key];
          const headline = headlineForDimension(key, dims);
          // Change summary updates in real time — never stale.
          const tileStale = stale && key !== 'change_summary';
          return (
            <ImpactTile
              key={key}
              meta={meta}
              headline={headline}
              stale={tileStale}
              active={openKey === key}
              onClick={handleToggle}
            />
          );
        })}
      </div>
      {openKey && (
        <ImpactDetailPanel
          key={openKey}
          dimensionKey={openKey}
          impact={impact}
          tier3Visible={tier3Visible}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
