/**
 * Shared types for the Compare view (L1 → L2 → L3).
 *
 * The Compare view stitches together two backend sources:
 *   1. `POST /api/scenarios/compare` — returns flat budget rollup per
 *      scenario column. Used for L2 (project comparison).
 *   2. `GET /api/scenarios/:id/impact` (per scenario) — used for L1
 *      portfolio summary (8-dimension headline rows). Each scenario is
 *      fetched independently and stitched into a wide table.
 */

import type {
  ImpactDashboardResponse,
  ImpactDashboardDimensions,
} from '../lib/impactTypes';
import type { ScenarioColumnInfo } from './ScenarioColumnHeader';

/**
 * One scenario's contribution to a Compare view. The anchor / current-state
 * column is represented as `kind: 'anchor'`; scenario columns carry the
 * impact response.
 */
export type CompareColumn =
  | {
      kind: 'anchor';
      info: ScenarioColumnInfo;
      /** Anchor totals from the compare endpoint. Per-project map. */
      projectBudgets: Record<string, { name: string; budget: number; rag: string | null }>;
    }
  | {
      kind: 'scenario';
      info: ScenarioColumnInfo;
      scenarioId: number;
      impact: ImpactDashboardResponse;
      /** Per-project rollup from the compare endpoint for L2 grids. */
      projectBudgets: Record<
        string,
        { name: string; budget: number; delta?: number; rag: string | null }
      >;
    };

export interface CompareViewState {
  /** Ordered list — anchor at index 0, then scenarios. */
  columns: CompareColumn[];
  /** Stable list of scenario ids in selection order. */
  scenarioIds: number[];
  /** Set true when ANY column is stale and the user should rebase. */
  anyStale: boolean;
}

/** Helper: extract dimension data for a scenario column. */
export function dimensionsFor(col: CompareColumn): ImpactDashboardDimensions | null {
  return col.kind === 'scenario' ? col.impact.dimensions : null;
}
