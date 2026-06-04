/**
 * v5 B2 — Typed wrappers for the B1 scenarios API surface.
 *
 * T1 owns this file; T2/T3/T4 request additions through SendMessage at
 * checkpoints. Each wrapper delegates to `frontend/src/api/endpoints.ts`
 * `scenariosApi`, which in turn uses the shared `api` client (handles
 * `X-Current-User` injection + non-2xx → Error).
 *
 * Coverage (B1 routers/scenarios.py):
 *  - Manager: list, create, remove, publish, unpublish, archive, rebase
 *  - Workspace: getDetail, updateMetadata, recalculate, impact
 *  - Actions: applyAction, removeAction, reorderActions
 *  - Cost allocation: createDistribution / updateDistribution / deleteDistribution,
 *    setToBusiness, setBtcLines, costAllocationImpact
 *  - Compare: compare, drillDown
 *  - Promote: promotePreview, promoteExecute, promotionsList
 *  - Apply-to-forecast: applyToForecast
 *  - Advisor (kept behind flag): advisorQuery, advisorApply
 */

import { api } from '@/api/client';
import { scenariosApi as legacyScenariosApi } from '@/api/endpoints';
import type {
  AdvisorQueryResponse,
  ComparisonResponse,
  DrillDownResponse,
  ScenarioCreateResponse,
  ScenarioDetail,
  ScenarioListResponse,
  ScenarioMetadataUpdateResponse,
  ScenarioStatusResponse,
} from '@/types/api';

// ---------------------------------------------------------------------------
// v5 B1 response shapes (typed inline; keep `frontend/src/types/api.ts`
// focused on shared cross-module types).
// ---------------------------------------------------------------------------

export interface ScenarioCreateBody {
  name: string;
  description?: string;
  clone_from?: number;
  anchor_forecast_version_id?: number;
  tags?: string[];
  cc_owner_scope_cc_id?: string;
}

export interface ScenarioMetadataBody {
  name?: string;
  description?: string;
  tags?: string[];
  visibility?: 'private' | 'tier3_only' | 'all_users';
}

export interface ScenarioRebaseBody {
  new_anchor_version_id: number;
}

export interface ScenarioPublishBody {
  visibility?: 'private' | 'tier3_only' | 'all_users';
}

export interface ScenarioArchiveBody {
  archived: boolean;
}

export interface ActionBody {
  scope: string;
  action_type: string;
  project_id?: string;
  parameters: Record<string, unknown>;
  lever_category?: string;
  tier?: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Cost allocation schemas
// ---------------------------------------------------------------------------

export interface DistributionEdgeCreateBody {
  year: number;
  source_entity_id: string;
  destination_entity_id: string;
  percentage: number;
}

export interface DistributionEdgeUpdateBody {
  percentage: number;
}

export interface ToBusinessChangeBody {
  entity_id: string;
  year: number;
  new_pct: number;
}

export interface BTCLineSpec {
  charging_location_id: string;
  percentage: number;
}

export interface BTCLinesChangeBody {
  entity_id: string;
  year: number;
  lines: BTCLineSpec[];
}

export interface CostAllocationImpactItem {
  entity_id: string;
  entity_name: string;
  charging_location_id: string;
  charging_location_code: string;
  anchor_amount: number;
  scenario_amount: number;
  delta: number;
}

export interface CostAllocationImpactResponse {
  year: number;
  anchor_version: string;
  scenario_version: string;
  touched_entity_count: number;
  items: CostAllocationImpactItem[];
  totals: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Impact dashboard
// ---------------------------------------------------------------------------

export interface ImpactDashboardResponse {
  scenario_id: number;
  tier3_content: boolean;
  tier3_visible: boolean;
  stale: boolean;
  anchor_forecast_version_id: number | null;
  /** 8-dimension grab-bag: financial, backlog_ranking, capacity, people, outsourcing, investment_mix, running_cost, cost_allocation. */
  dimensions: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

export interface RoutingDecisionItem {
  action_id: number;
  action_type: string;
  lever_category: string | null;
  routing_type: string;
  target_id: string | null;
  requires_review: boolean;
  message: string;
  permission_ok?: boolean | null;
  permission_message?: string | null;
}

export interface PromotePreviewResponse {
  scenario_id: number;
  anchor_forecast_version_id: number | null;
  decisions: RoutingDecisionItem[];
}

export interface PromoteResultItem {
  action_id?: number | null; // null for overlay-only routes (no ScenarioAction)
  routing_type: string;
  status: 'promoted' | 'skipped';
  message: string;
  target_id?: string | null;
  // Number of draft CRs this row created (0 when the diff netted to no change).
  change_requests_created?: number;
  // The created draft CR id, when the row maps to a single CR. Sim E2E S2.
  change_request_id?: number;
  // Project the routed change request targets — enables a Workbench deep-link.
  project_id?: string | null;
}

export interface PromoteExecuteResponse {
  scenario_id: number;
  promotion_id: number;
  promoted_at: string;
  promoted_count: number;
  skipped_count: number;
  summary: PromoteResultItem[];
}

export interface PromotionAuditItem {
  id: number;
  promoted_at: string;
  promoted_by_id: string;
  promoted_count: number;
  skipped_count: number;
  notes: string | null;
  summary: PromoteResultItem[];
}

export interface PromotionsListResponse {
  items: PromotionAuditItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Apply-to-forecast
// ---------------------------------------------------------------------------

export interface ApplyToForecastBody {
  cycle_id?: string;
  cycle_label?: string;
}

export interface ApplyToForecastSummaryItem {
  action_id: number;
  project_id?: string | null;
  status: string;
  message: string;
  // Legacy provisional-cell framing — kept optional for backward compat.
  cells_marked_provisional?: number | null;
  // Sim E2E S2: apply now creates draft Change Requests (one per cost
  // centre) instead of writing provisional Forecast cells.
  change_requests_created?: number;
  // The created draft CR id, when a single CR maps to this item.
  change_request_id?: number;
}

export interface ApplyToForecastResponse {
  scenario_id: number;
  event_id: number;
  applied_by: string;
  applied_at: string;
  diffs_carried_forward: number;
  diffs_skipped: number;
  summary: ApplyToForecastSummaryItem[];
  provenance_note: string;
  // Sim E2E S2: total number of draft CRs created across all cost centres.
  draft_change_requests_created?: number;
}

// ---------------------------------------------------------------------------
// Recalculate
// ---------------------------------------------------------------------------

export interface RecalculateResponse {
  scenario_id: number;
  last_recalculated_at: string | null;
  tier3_content_flag: boolean;
}

// ---------------------------------------------------------------------------
// Project-scope redesign Session 2 — editable forecast grid (contract)
//
// Purpose-built grid shape (NOT MixedGridResponse): pure monthly columns, one
// row per resolved line, anchor value per cell so the surface can mark changed
// cells + drive per-cell revert. Mirrors backend schemas/scenarios.py.
// ---------------------------------------------------------------------------

export interface ScenarioGridColumn {
  key: string; // "YYYY-MM"
  cell_type: 'monthly';
}

export interface ScenarioGridCell {
  month: string;
  display_value: number; // internal → hours; external → €
  amount_eur: number; // always the € value (internal: hours × rate)
  anchor_value: number | null; // pre-overlay value in the cell's field
  anchor_amount_eur: number | null; // anchor cell's stored € (live-local anchor/delta)
  field: 'hours' | 'amount_eur';
  can_edit: boolean; // false for actuals (month < DEMO_DATE)
  is_changed: boolean; // resolved differs from anchor (incl. macro shifts)
  has_overlay: boolean; // a hand-overlay row exists for this cell (revertable)
  is_empty: boolean;
}

export interface ScenarioGridRow {
  line_key: string; // round-tripped on write/revert
  category: 'internal' | 'external';
  kind: 'internal_role' | 'external_cost';
  sub_category_name: string;
  hourly_rate: number | null; // internal lines only
  // S6 location-aware rates: workforce location of an internal role line (split
  // per location). Null for external lines and location-less rows. The line_key
  // already encodes the location as its 4th segment, so split lines stay unique.
  location_id?: string | null;
  location_name?: string | null; // city label for the location chip
  cells: ScenarioGridCell[];
}

export interface ScenarioGridResponse {
  scenario_id: number;
  project_id: string;
  start_month: string | null;
  end_month: string | null;
  open_month: string; // DEMO_DATE — actuals/future boundary
  columns: ScenarioGridColumn[];
  rows: ScenarioGridRow[];
}

export interface ScenarioProjectItem {
  id: string;
  name: string;
  pipeline_stage: string;
}

export interface ScenarioProjectsResponse {
  items: ScenarioProjectItem[];
  total: number;
}

export interface CellEditBody {
  line_key: string;
  month: string; // "YYYY-MM"
  field: 'hours' | 'amount_eur';
  value: number | null; // null zeroes the cell; revert is a DELETE
}

export interface ScenarioGridWriteResponse {
  state: ScenarioDetail; // verbatim recalculate_scenario output
  grid: ScenarioGridResponse;
}

// ---------------------------------------------------------------------------
// Project-scope redesign Session 3 — T1 edit surfaces
//   role lines (add/remove), plan edits (dates/stage/doi/milestones), Tier-3 mix
// ---------------------------------------------------------------------------

export interface LineAddBody {
  role_type_id: string;
  sub_category?: string;
  category?: string;
  // S6 location-aware rates: workforce location for the added internal line
  // (determines the line's rate). Null → resolves via Munich/any fallback.
  location_id?: string;
}

export interface ScenarioLineWriteResponse {
  line_key: string;
  state: ScenarioDetail;
  grid: ScenarioGridResponse;
}

export type PlanTarget = 'start_month' | 'end_month' | 'stage' | 'doi' | 'milestone';

export interface PlanEditBody {
  target: PlanTarget;
  value?: string | null;
  milestone_id?: string | null;
  entry_json?: Record<string, unknown> | null;
}

export interface ScenarioPlanMilestone {
  milestone_id: string;
  name: string;
  forecast_start: string | null;
  forecast_end: string | null;
  anchor_forecast_start: string | null;
  anchor_forecast_end: string | null;
  is_changed: boolean;
}

export interface ScenarioPlanResponse {
  project_id: string;
  start_month: string | null;
  end_month: string | null;
  stage: string | null;
  doi: number | null;
  anchor_start_month: string | null;
  anchor_end_month: string | null;
  anchor_stage: string | null;
  anchor_doi: number | null;
  start_changed: boolean;
  end_changed: boolean;
  stage_changed: boolean;
  doi_changed: boolean;
  milestones: ScenarioPlanMilestone[];
}

export interface ScenarioPlanWriteResponse {
  state: ScenarioDetail;
  grid: ScenarioGridResponse;
  plan: ScenarioPlanResponse;
}

export interface MixChangeBody {
  swap_from_role_id: string;
  swap_to_role_id: string;
  hours_per_month_swap: number;
  effective_from: string; // "YYYY-MM"
  cost_center_id?: string | null;
  // S6 location-aware rates: workforce location of the from/to role lines. The
  // UX swaps within ONE location — send `swap_from_location_id`; the backend
  // mirrors it to the to-side when only one is given. Both nullable (back-compat).
  swap_from_location_id?: string | null;
  swap_to_location_id?: string | null;
}

export interface ScenarioMixItem {
  id: number;
  cost_center_id: string | null;
  swap_from_role_id: string | null;
  swap_to_role_id: string | null;
  hours_per_month_swap: number | null;
  effective_from: string | null;
  swap_from_location_id?: string | null;
  swap_to_location_id?: string | null;
}

export interface ScenarioMixWriteResponse {
  state: ScenarioDetail;
  grid: ScenarioGridResponse;
  mix_changes: ScenarioMixItem[];
}

export interface ScenarioMixListResponse {
  mix_changes: ScenarioMixItem[];
}

// ---------------------------------------------------------------------------
// Project-scope redesign Session 3 — T2 external-cost line items
//   add / remove / edit (vendor, category=cost-type rollup, description, capex).
// ---------------------------------------------------------------------------

export interface ExternalCostLineCreateBody {
  cost_type_id: string;
  vendor?: string | null;
  description?: string | null;
  capex_opex?: string | null;
}

export interface ExternalCostLineUpdateBody {
  cost_type_id?: string | null;
  vendor?: string | null;
  description?: string | null;
  capex_opex?: string | null;
}

export interface ExternalCostTypeOption {
  id: string;
  name: string;
}

export interface ExternalCostLineItem {
  line_key: string;
  cost_type_id: string | null;
  cost_type_name: string | null;
  vendor: string | null;
  description: string | null;
  capex_opex: string | null;
  total_eur: number;
  origin: 'anchor' | 'added';
}

export interface ExternalCostListResponse {
  scenario_id: number;
  project_id: string;
  items: ExternalCostLineItem[];
  available_cost_types: ExternalCostTypeOption[];
  total: number;
}

export interface ExternalCostWriteResponse {
  line_key: string;
  state: ScenarioDetail;
  grid: ScenarioGridResponse;
  external_costs: ExternalCostListResponse;
}

// ---------------------------------------------------------------------------
// Wrapper object
// ---------------------------------------------------------------------------

export const scenariosApi = {
  // -------------------------------------------------------------------------
  // Manager
  // -------------------------------------------------------------------------
  list: (opts?: { include_archived?: boolean; tag?: string }) => {
    const q = new URLSearchParams();
    if (opts?.include_archived) q.set('include_archived', 'true');
    if (opts?.tag) q.set('tag', opts.tag);
    const qs = q.toString();
    return api.get<ScenarioListResponse>(
      qs ? `/api/scenarios?${qs}` : '/api/scenarios',
    );
  },

  create: (body: ScenarioCreateBody) =>
    api.post<ScenarioCreateResponse>('/api/scenarios', body),

  remove: (scenarioId: number) =>
    legacyScenariosApi.remove(scenarioId),

  publish: (scenarioId: number, body?: ScenarioPublishBody) =>
    api.put<ScenarioStatusResponse>(
      `/api/scenarios/${scenarioId}/publish`,
      body ?? {},
    ),

  unpublish: (scenarioId: number) =>
    api.put<ScenarioStatusResponse>(
      `/api/scenarios/${scenarioId}/unpublish`,
      {},
    ),

  archive: (scenarioId: number, archived: boolean) =>
    api.put<{ id: number; archived: boolean; archived_at: string | null }>(
      `/api/scenarios/${scenarioId}/archive`,
      { archived },
    ),

  rebase: (scenarioId: number, body: ScenarioRebaseBody) =>
    api.put<{
      id: number;
      anchor_forecast_version_id: number | null;
      rebased_from_version_id: number | null;
    }>(`/api/scenarios/${scenarioId}/rebase`, body),

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------
  getDetail: (scenarioId: number) =>
    legacyScenariosApi.getDetail(scenarioId),

  updateMetadata: (scenarioId: number, body: ScenarioMetadataBody) =>
    api.put<ScenarioMetadataUpdateResponse & { tags?: string[]; visibility?: string }>(
      `/api/scenarios/${scenarioId}/metadata`,
      body,
    ),

  recalculate: (scenarioId: number) =>
    api.post<RecalculateResponse>(
      `/api/scenarios/${scenarioId}/recalculate`,
      {},
    ),

  impact: (scenarioId: number, year = 2026) =>
    api.get<ImpactDashboardResponse>(
      `/api/scenarios/${scenarioId}/impact?year=${year}`,
    ),

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  applyAction: (scenarioId: number, body: ActionBody) =>
    api.post<ScenarioDetail>(
      `/api/scenarios/${scenarioId}/actions`,
      body,
    ),

  removeAction: (scenarioId: number, actionId: number) =>
    api.delete<ScenarioDetail>(
      `/api/scenarios/${scenarioId}/actions/${actionId}`,
    ),

  reorderActions: (scenarioId: number, actionIds: number[]) =>
    legacyScenariosApi.reorderActions(scenarioId, actionIds),

  // -------------------------------------------------------------------------
  // Project-scope Session 2 — editable forecast grid (read / write / revert).
  // Macros reuse applyAction / removeAction above.
  // -------------------------------------------------------------------------
  getScenarioGrid: (scenarioId: number, projectId: string) =>
    api.get<ScenarioGridResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/grid`,
    ),

  // All active projects selectable in the simulator workspace (portfolio-wide
  // what-if — NOT the Portfolio 'Change' population, which drops backlog stages).
  getScenarioProjects: (scenarioId: number) =>
    api.get<ScenarioProjectsResponse>(
      `/api/scenarios/${scenarioId}/projects`,
    ),

  writeCellOverlay: (scenarioId: number, projectId: string, body: CellEditBody) =>
    api.put<ScenarioGridWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/cells`,
      body,
    ),

  // Revert per cell: line_key + month (+ optional field).
  revertCell: (
    scenarioId: number,
    projectId: string,
    ref: { line_key: string; month: string; field?: 'hours' | 'amount_eur' },
  ) => {
    const qs = new URLSearchParams({ line_key: ref.line_key, month: ref.month });
    if (ref.field) qs.append('field', ref.field);
    return api.delete<ScenarioGridWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/cells?${qs.toString()}`,
    );
  },

  // Revert per line: line_key only.
  revertLine: (scenarioId: number, projectId: string, lineKey: string) => {
    const qs = new URLSearchParams({ line_key: lineKey });
    return api.delete<ScenarioGridWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/cells?${qs.toString()}`,
    );
  },

  // Clear all cell overlays for the project: no params.
  clearProjectOverlay: (scenarioId: number, projectId: string) =>
    api.delete<ScenarioGridWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/cells`,
    ),

  // --- T1: lines / plan / mix ---------------------------------------------
  // Role lines (add/remove — open to all authors), plan edits (dates / stage /
  // DoI / milestones), and the Tier-3 mix control. All write endpoints recalc
  // and return the resolved grid so the surface reconciles in one round-trip.
  addRoleLine: (scenarioId: number, projectId: string, body: LineAddBody) =>
    api.post<ScenarioLineWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/lines`,
      body,
    ),

  removeRoleLine: (scenarioId: number, projectId: string, lineKey: string) =>
    api.delete<ScenarioLineWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/lines/${encodeURIComponent(lineKey)}`,
    ),

  getScenarioPlan: (scenarioId: number, projectId: string) =>
    api.get<ScenarioPlanResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/plan`,
    ),

  writePlanEdit: (scenarioId: number, projectId: string, body: PlanEditBody) =>
    api.put<ScenarioPlanWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/plan`,
      body,
    ),

  revertPlanEdit: (
    scenarioId: number,
    projectId: string,
    ref?: { target?: PlanTarget; milestone_id?: string },
  ) => {
    const qs = new URLSearchParams();
    if (ref?.target) qs.set('target', ref.target);
    if (ref?.milestone_id) qs.set('milestone_id', ref.milestone_id);
    const tail = qs.toString();
    return api.delete<ScenarioPlanWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/plan${tail ? `?${tail}` : ''}`,
    );
  },

  getScenarioMix: (scenarioId: number, projectId: string) =>
    api.get<ScenarioMixListResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/mix`,
    ),

  writeMixChange: (scenarioId: number, projectId: string, body: MixChangeBody) =>
    api.put<ScenarioMixWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/mix`,
      body,
    ),

  revertMixChange: (scenarioId: number, projectId: string, mixId?: number) => {
    const tail = mixId != null ? `?mix_id=${mixId}` : '';
    return api.delete<ScenarioMixWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/mix${tail}`,
    );
  },

  // --- T2: external costs --------------------------------------------------
  // External-cost line items: list + add / edit / remove. The write endpoints
  // recalc and return the resolved grid + the refreshed external-line list so
  // the editor reconciles in one round-trip (mirrors the cell/line contract).
  listExternalCosts: (scenarioId: number, projectId: string) =>
    api.get<ExternalCostListResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/external-costs`,
    ),

  addExternalCost: (
    scenarioId: number,
    projectId: string,
    body: ExternalCostLineCreateBody,
  ) =>
    api.post<ExternalCostWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/external-costs`,
      body,
    ),

  editExternalCost: (
    scenarioId: number,
    projectId: string,
    lineKey: string,
    body: ExternalCostLineUpdateBody,
  ) =>
    api.put<ExternalCostWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/external-costs/${encodeURIComponent(lineKey)}`,
      body,
    ),

  removeExternalCost: (scenarioId: number, projectId: string, lineKey: string) =>
    api.delete<ExternalCostWriteResponse>(
      `/api/scenarios/${scenarioId}/projects/${projectId}/external-costs/${encodeURIComponent(lineKey)}`,
    ),

  // -------------------------------------------------------------------------
  // Cost allocation (Stage 1 distributions, Stage 2 BTC, to-business override)
  // -------------------------------------------------------------------------
  createDistribution: (scenarioId: number, body: DistributionEdgeCreateBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/cost-allocation/distributions`,
      body,
    ),

  updateDistribution: (
    scenarioId: number,
    edgeId: number,
    body: DistributionEdgeUpdateBody,
  ) =>
    api.put<unknown>(
      `/api/scenarios/${scenarioId}/cost-allocation/distributions/${edgeId}`,
      body,
    ),

  deleteDistribution: (scenarioId: number, edgeId: number) =>
    api.delete<unknown>(
      `/api/scenarios/${scenarioId}/cost-allocation/distributions/${edgeId}`,
    ),

  setToBusiness: (scenarioId: number, body: ToBusinessChangeBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/cost-allocation/to-business`,
      body,
    ),

  setBtcLines: (scenarioId: number, body: BTCLinesChangeBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/cost-allocation/btc-lines`,
      body,
    ),

  costAllocationImpact: (scenarioId: number, year = 2026) =>
    api.get<CostAllocationImpactResponse>(
      `/api/scenarios/${scenarioId}/cost-allocation/cost-allocation-impact?year=${year}`,
    ),

  // -------------------------------------------------------------------------
  // Compare + Drill-down
  // -------------------------------------------------------------------------
  compare: (scenarioIds: number[]) =>
    api.post<ComparisonResponse>('/api/scenarios/compare', {
      scenario_ids: scenarioIds,
    }),

  drillDown: (scenarioId: number, level: string, parentId?: string) => {
    const q = new URLSearchParams({ level });
    if (parentId) q.set('parent_id', parentId);
    return api.get<DrillDownResponse>(
      `/api/scenarios/${scenarioId}/drill-down?${q}`,
    );
  },

  // -------------------------------------------------------------------------
  // Promote workflow (controller-only)
  // -------------------------------------------------------------------------
  promotePreview: (scenarioId: number, actionIds?: number[]) =>
    api.post<PromotePreviewResponse>(
      `/api/scenarios/${scenarioId}/promote/preview`,
      actionIds ? { action_ids: actionIds } : {},
    ),

  promoteExecute: (
    scenarioId: number,
    body?: { action_ids?: number[]; notes?: string },
  ) =>
    api.post<PromoteExecuteResponse>(
      `/api/scenarios/${scenarioId}/promote`,
      body ?? {},
    ),

  promotionsList: (scenarioId: number) =>
    api.get<PromotionsListResponse>(
      `/api/scenarios/${scenarioId}/promotions`,
    ),

  // -------------------------------------------------------------------------
  // Apply-to-forecast (PL-only)
  // -------------------------------------------------------------------------
  applyToForecast: (scenarioId: number, body?: ApplyToForecastBody) =>
    api.post<ApplyToForecastResponse>(
      `/api/scenarios/${scenarioId}/apply-to-forecast`,
      body ?? {},
    ),

  // -------------------------------------------------------------------------
  // Advisor (kept behind ADVISOR_ENABLED flag)
  // -------------------------------------------------------------------------
  advisorQuery: (scenarioId: number, goal: string) =>
    api.post<AdvisorQueryResponse>(
      `/api/scenarios/${scenarioId}/advisor/query`,
      { goal },
    ),

  advisorApply: (scenarioId: number, pathId: string) =>
    api.post<ScenarioDetail>(
      `/api/scenarios/${scenarioId}/advisor/apply`,
      { path_id: pathId },
    ),

  // -------------------------------------------------------------------------
  // Aliases — explicit names matching T2/T3/T4's B2-survey naming.
  // -------------------------------------------------------------------------

  // T3 — Impact alias (mirrors `impact` above)
  getImpact: (scenarioId: number, year = 2026) =>
    api.get<ImpactDashboardResponse>(
      `/api/scenarios/${scenarioId}/impact?year=${year}`,
    ),

  // T4 — Promotions audit-list alias (mirrors `promotionsList` above)
  listPromotions: (scenarioId: number) =>
    api.get<PromotionsListResponse>(
      `/api/scenarios/${scenarioId}/promotions`,
    ),
};

export type ScenariosApi = typeof scenariosApi;
