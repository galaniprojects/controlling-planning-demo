/**
 * Narrow TypeScript types for the 8-dimension impact dashboard returned by
 * `GET /api/scenarios/:id/impact`.
 *
 * Backend (`backend/services/scenario_impact.py`) returns each dimension as
 * an opaque dict so it can evolve without schema churn. We mirror the actual
 * shapes here so the frontend renderers can compile against typed access.
 *
 * Source of truth = `compute_*_dimension` functions in scenario_impact.py
 * + `compute_cost_allocation_impact` in scenario_lever12.py.
 */

// ---------------------------------------------------------------------------
// Dimension 1 — Financial
// ---------------------------------------------------------------------------

export interface TimeFrameSegment {
  label: string;
  year: number | null;
  original: number;
  adjusted: number;
  delta: number;
}

export interface FinancialBreakdown {
  original: number;
  adjusted: number;
  delta: number;
}

export interface FinancialDimensionData {
  total_anchor: number | null;
  total_original: number;
  total_adjusted: number;
  total_delta: number;
  capex: FinancialBreakdown;
  opex: FinancialBreakdown;
  time_frame_breakdown: TimeFrameSegment[];
  headline?: string;
}

// ---------------------------------------------------------------------------
// Dimension 2 — Backlog ranking
// ---------------------------------------------------------------------------

export interface BacklogRankingDimensionData {
  projects_affected: number;
  projects_removed_count: number;
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 3 — Capacity
// ---------------------------------------------------------------------------

export interface CapacityCostCenterRow {
  cost_center_id: string;
  max_original: number;
  max_adjusted: number;
  fte_delta_total: number;
  month_count: number;
}

export interface CapacityDimensionData {
  cost_centers: CapacityCostCenterRow[];
  over_100_count: number;
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 4 — People (Tier 3 only — may be redacted)
// ---------------------------------------------------------------------------

export interface PeopleDimensionData {
  tier: 3;
  redacted?: boolean;
  action_count?: number;
  by_type?: Record<string, number>;
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 5 — Outsourcing ratio
// ---------------------------------------------------------------------------

export interface OutsourcingDimensionData {
  internal_total: number;
  external_total: number;
  internal_pct: number;
  external_pct: number;
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 6 — Investment mix
// ---------------------------------------------------------------------------

export interface InvestmentMixItem {
  node_id: string;
  node_name: string;
  anchor_total: number;
  scenario_total: number;
  anchor_pct: number;
  scenario_pct: number;
  delta: number;
}

export interface InvestmentMixDimensionData {
  items: InvestmentMixItem[];
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 7 — Running cost
// ---------------------------------------------------------------------------

export interface RunningCostDimensionData {
  time_frame_breakdown: TimeFrameSegment[];
  headline: string;
}

// ---------------------------------------------------------------------------
// Dimension 8 — Change summary (real-time, append-only)
// ---------------------------------------------------------------------------

export interface ChangeSummaryActionEntry {
  id?: number;
  action_order?: number;
  action_type: string;
  scope?: string;
  project_id?: string | null;
  project_name?: string | null;
  parameters?: Record<string, unknown>;
  lever_category?: string | null;
  tier?: number | null;
  group_label?: string | null;
  promoted_at?: string | null;
}

export interface ChangeSummaryDimensionData {
  total_actions: number;
  by_category: Record<string, number>;
  actions: ChangeSummaryActionEntry[];
}

// ---------------------------------------------------------------------------
// Dimension 9 (a.k.a. Lever-12 sub-section) — Cost allocation overlay
// ---------------------------------------------------------------------------

export interface CostAllocationLocationItem {
  entity_id: string;
  entity_name: string;
  charging_location_id: string;
  charging_location_code: string;
  anchor_amount: number;
  scenario_amount: number;
  delta: number;
}

export interface CostAllocationDimensionData {
  year: number;
  anchor_version: string;
  scenario_version: string;
  touched_entity_count: number;
  items: CostAllocationLocationItem[];
  totals: {
    anchor_total: number;
    scenario_total: number;
    delta: number;
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// Top-level response
// ---------------------------------------------------------------------------

export interface ImpactDashboardDimensions {
  financial?: FinancialDimensionData;
  backlog_ranking?: BacklogRankingDimensionData;
  capacity?: CapacityDimensionData;
  people?: PeopleDimensionData;
  outsourcing_ratio?: OutsourcingDimensionData;
  investment_mix?: InvestmentMixDimensionData;
  running_cost?: RunningCostDimensionData;
  change_summary?: ChangeSummaryDimensionData;
  cost_allocation?: CostAllocationDimensionData;
}

export interface ImpactDashboardResponse {
  scenario_id: number;
  tier3_content: boolean;
  tier3_visible: boolean;
  stale: boolean;
  anchor_forecast_version_id: number | null;
  dimensions: ImpactDashboardDimensions;
}

// ---------------------------------------------------------------------------
// Dimension keys (drives strip ordering + tile metadata)
// ---------------------------------------------------------------------------

export type DimensionKey =
  | 'financial'
  | 'backlog_ranking'
  | 'capacity'
  | 'people'
  | 'outsourcing_ratio'
  | 'investment_mix'
  | 'running_cost'
  | 'cost_allocation'
  | 'change_summary';

/**
 * Display order for the 8-tile impact strip per spec line 1074. People is at
 * position 4 (Tier-3 only, hidden for non-Tier-3 callers). Cost allocation
 * (Lever-12 overlay) is positioned next to financial since it lives in the
 * same financial-impact mental model.
 */
export const DIMENSION_DISPLAY_ORDER: DimensionKey[] = [
  'financial',
  'backlog_ranking',
  'capacity',
  'people',
  'outsourcing_ratio',
  'investment_mix',
  'running_cost',
  'cost_allocation',
  'change_summary',
];

export interface DimensionMeta {
  key: DimensionKey;
  label: string;
  /** Lucide icon name; resolved by the tile renderer. */
  iconKey:
    | 'wallet'
    | 'list-ordered'
    | 'users'
    | 'user-cog'
    | 'split'
    | 'pie-chart'
    | 'trending-up'
    | 'route'
    | 'clipboard-list';
  /** True if the tile should be hidden for non-Tier-3 users. */
  tier3Only?: boolean;
}

export const DIMENSION_META: Record<DimensionKey, DimensionMeta> = {
  financial: {
    key: 'financial',
    label: 'Financial',
    iconKey: 'wallet',
  },
  backlog_ranking: {
    key: 'backlog_ranking',
    label: 'Ranking',
    iconKey: 'list-ordered',
  },
  capacity: {
    key: 'capacity',
    label: 'Capacity',
    iconKey: 'users',
  },
  people: {
    key: 'people',
    label: 'People',
    iconKey: 'user-cog',
    tier3Only: true,
  },
  outsourcing_ratio: {
    key: 'outsourcing_ratio',
    label: 'Outsourcing',
    iconKey: 'split',
  },
  investment_mix: {
    key: 'investment_mix',
    label: 'Investment Mix',
    iconKey: 'pie-chart',
  },
  running_cost: {
    key: 'running_cost',
    label: 'Running Cost',
    iconKey: 'trending-up',
  },
  cost_allocation: {
    key: 'cost_allocation',
    label: 'Cost Allocation',
    iconKey: 'route',
  },
  change_summary: {
    key: 'change_summary',
    label: 'Change Summary',
    iconKey: 'clipboard-list',
  },
};
