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
 *  - Lever 12: createDistribution / updateDistribution / deleteDistribution,
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
// Lever 12 schemas
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
  action_id: number;
  routing_type: string;
  status: 'promoted' | 'skipped';
  message: string;
  target_id?: string | null;
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
  cells_marked_provisional?: number | null;
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
  // Lever 12 (Stage 1 distributions, Stage 2 BTC, to-business override)
  // -------------------------------------------------------------------------
  createDistribution: (scenarioId: number, body: DistributionEdgeCreateBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/lever12/distributions`,
      body,
    ),

  updateDistribution: (
    scenarioId: number,
    edgeId: number,
    body: DistributionEdgeUpdateBody,
  ) =>
    api.put<unknown>(
      `/api/scenarios/${scenarioId}/lever12/distributions/${edgeId}`,
      body,
    ),

  deleteDistribution: (scenarioId: number, edgeId: number) =>
    api.delete<unknown>(
      `/api/scenarios/${scenarioId}/lever12/distributions/${edgeId}`,
    ),

  setToBusiness: (scenarioId: number, body: ToBusinessChangeBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/lever12/to-business`,
      body,
    ),

  setBtcLines: (scenarioId: number, body: BTCLinesChangeBody) =>
    api.post<unknown>(
      `/api/scenarios/${scenarioId}/lever12/btc-lines`,
      body,
    ),

  costAllocationImpact: (scenarioId: number, year = 2026) =>
    api.get<CostAllocationImpactResponse>(
      `/api/scenarios/${scenarioId}/lever12/cost-allocation-impact?year=${year}`,
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
};

export type ScenariosApi = typeof scenariosApi;
