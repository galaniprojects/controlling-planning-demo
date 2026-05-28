/**
 * Pure projection helpers for the Distribution Editor's
 * **Sum Validation Bar** and **Allocation Preview Panel** (Session 5
 * spec §5.4 and §5.7).
 *
 * The Wave-B redesign moves from per-row immediate writes to a
 * batched-Save form. The user types in the table, and the bar + side
 * panel must reflect EUR amounts and percentages **without re-fetching**
 * on every keystroke. This module is the single source of truth for
 * those derived values — both consumers read the same projection so
 * they cannot drift.
 *
 * Inputs:
 *  - `focalEffectiveCost` — `cascade.focal.effective_cost`, the
 *    rolled-up €€ that flows through this entity in the targeted
 *    `DistributionVersion`.
 *  - `pending.rows` — visible rows in the editor (already exclude
 *    soft-deleted rows).
 *  - `pending.toBusinessPct` — current draft of
 *    `ChargeableEntity.to_business_pct`.
 *
 * Outputs (single object so consumers memoise on a stable reference):
 *  - `downstream` — one entry per visible row, with computed `amount` €
 *    and `lineWidthPx` for the side-panel connector (bounded
 *    `1px + pct × 0.2px`, capped at 21px).
 *  - `toBusinessAmount` — €€ flowing to business terminals.
 *  - `distributedPct` — Σ row percentages.
 *  - `selfRetainedPct` — `100 − distributedPct − toBusinessPct`. May go
 *    negative when the user over-allocates.
 *  - `isOverAllocated` — `selfRetainedPct < 0`. Drives the sum bar red
 *    state + disables Save.
 *  - `isComplete` — `distributedPct + toBusinessPct === 100`. Green bar.
 *
 * No React, no async, no IO — fully pure so it's trivially testable.
 */

export interface ProjectableRow {
  /** Stable identifier for the row (edge id or temp key). */
  key: string;
  /** Destination entity id (may not exist in cascade lists for new rows). */
  destinationId: string;
  /** Percentage on this edge, 0–100. */
  percentage: number;
}

export interface ProjectedDownstreamRow {
  key: string;
  destinationId: string;
  percentage: number;
  /** focalEffectiveCost × percentage / 100. */
  amount: number;
  /** Bounded `1px + pct × 0.2px`, capped at [1, 21]. */
  lineWidthPx: number;
}

export interface AllocationProjection {
  downstream: ProjectedDownstreamRow[];
  toBusinessAmount: number;
  distributedPct: number;
  selfRetainedPct: number;
  selfRetainedAmount: number;
  isOverAllocated: boolean;
  isComplete: boolean;
}

/**
 * Width of the side-panel connector line for a given percentage. The
 * formula is intentionally gentle so a 10% edge is visibly thinner than
 * a 50% edge but no edge dominates the rendering. Spec §5.7:
 * "thickness scaled to percentage".
 */
export function previewLineWidth(percentage: number): number {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  const raw = 1 + Math.max(0, pct) * 0.2;
  return Math.max(1, Math.min(21, raw));
}

function safeNumber(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the full projection for one render. Caller is expected to
 * memoise on `[focalEffectiveCost, pending.rows, pending.toBusinessPct]`
 * so React skips work when nothing changed.
 */
export function projectAllocation(input: {
  focalEffectiveCost: number;
  rows: ProjectableRow[];
  toBusinessPct: number;
}): AllocationProjection {
  const focal = safeNumber(input.focalEffectiveCost);
  const tbp = Math.max(0, safeNumber(input.toBusinessPct));

  const downstream: ProjectedDownstreamRow[] = input.rows.map((r) => {
    const pct = Math.max(0, safeNumber(r.percentage));
    return {
      key: r.key,
      destinationId: r.destinationId,
      percentage: pct,
      amount: (focal * pct) / 100,
      lineWidthPx: previewLineWidth(pct),
    };
  });

  const distributedPct = downstream.reduce((s, r) => s + r.percentage, 0);
  const toBusinessAmount = (focal * tbp) / 100;
  const selfRetainedPct = round2(100 - distributedPct - tbp);
  const selfRetainedAmount = (focal * Math.max(0, selfRetainedPct)) / 100;
  // Tolerate floating-point dust around the 100% boundary.
  const isOverAllocated = selfRetainedPct < -0.0001;
  const isComplete = Math.abs(selfRetainedPct) < 0.0001;

  return {
    downstream,
    toBusinessAmount,
    distributedPct: round2(distributedPct),
    selfRetainedPct,
    selfRetainedAmount,
    isOverAllocated,
    isComplete,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
