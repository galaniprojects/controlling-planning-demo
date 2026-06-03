/**
 * v5 B2 — ScenarioContext: single source of truth for the workspace.
 *
 * Provided by `ScenarioWorkspacePage`. Consumed by every surface,
 * the impact dashboard, the catalogue, the drawer, and the apply /
 * promote panels. Replaces v4's `useScenarioState` reducer.
 *
 * State shape:
 *  - `scenarioId` — numeric id of the scenario being edited.
 *  - `scenarioVersion` — `'scenario-{id}'` sandbox version string.
 *    Surfaces forward this to their canonical APIs (forecast grid,
 *    BTC editor, distribution editor, rollup view, backlog) so that
 *    edits land in the sandbox instead of the live forecast.
 *  - `detail` — last fetched ScenarioDetail (metadata + actions +
 *    project_states + capacity_impacts + headline). v4-shape.
 *  - `impact` — last fetched 8-dimension ImpactDashboardResponse. May
 *    be null until the first explicit `recalculate()` returns.
 *  - `loading` / `error` — request lifecycle.
 *  - `stale` — true after any diff-changing mutation; the impact
 *    dashboard does NOT auto-refetch on diff change (matches
 *    `services/scenario_impact.py` semantics: explicit recalc only).
 *  - `anchorVersionId` — denormalised from detail metadata; used by
 *    promote / compare gates.
 *  - `isOwner` / `canPromote` / `canApplyToForecast` — derived from
 *    role context + scenario.author_id.
 *  - `tier3Visible` — derived from role context + impact response.
 *  - `ccOwnerScopeCcId` — scenario's `cc_owner_scope_cc_id`, or null.
 *  - `changeSummaryEntries` — optimistic feed of recent diffs (drawer
 *    consumer). Appended after each successful mutation; persisted in
 *    memory only. Used by the ChangeSummaryDrawer per spec line 1048.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useRole } from '@/contexts/RoleContext';
import type { ScenarioDetail } from '@/types/api';
import {
  buildScenarioVersion,
  parseScenarioVersion,
} from './lib/scenarioVersion';
import {
  scenariosApi,
  type ActionBody,
  type ApplyToForecastBody,
  type ApplyToForecastResponse,
  type BTCLinesChangeBody,
  type CellEditBody,
  type CostAllocationImpactResponse,
  type DistributionEdgeCreateBody,
  type DistributionEdgeUpdateBody,
  type ImpactDashboardResponse,
  type LineAddBody,
  type MixChangeBody,
  type PlanEditBody,
  type PromoteExecuteResponse,
  type PromotePreviewResponse,
  type ScenarioGridWriteResponse,
  type ScenarioLineWriteResponse,
  type ScenarioMetadataBody,
  type ScenarioMixWriteResponse,
  type ScenarioPlanWriteResponse,
  type ScenarioPublishBody,
  type ToBusinessChangeBody,
  type ExternalCostLineCreateBody,
  type ExternalCostLineUpdateBody,
  type ExternalCostListResponse,
  type ExternalCostWriteResponse,
} from './api/scenariosApi';

// ---------------------------------------------------------------------------
// Change-summary feed
// ---------------------------------------------------------------------------

export type ChangeSummaryKind =
  | 'action'
  | 'lever12_distribution'
  | 'lever12_btc'
  | 'lever12_to_business'
  | 'metadata'
  | 'lifecycle'
  | 'promote'
  | 'apply';

export interface ChangeSummaryEntry {
  /** Local monotonic id for keying. */
  id: string;
  kind: ChangeSummaryKind;
  /** Human-readable headline (e.g. "Delay PRJ-001 by 2 months"). */
  label: string;
  /** Optional secondary description. */
  detail?: string;
  /** Wall-clock timestamp in millis. */
  timestamp: number;
  /** Action id if this entry corresponds to a stored ScenarioAction. */
  actionId?: number;
}

// ---------------------------------------------------------------------------
// Reducer state
// ---------------------------------------------------------------------------

interface ScenarioReducerState {
  detail: ScenarioDetail | null;
  impact: ImpactDashboardResponse | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  // Monotonic count of diff-changing mutations. Drives the debounced
  // cross-portfolio recompute (§7): each edit bumps it, resetting the
  // ~1s timer so the expensive impact dashboard refreshes only once
  // editing pauses. Not reset by recalculate (which clears `stale`).
  mutationSeq: number;
  changeSummaryEntries: ChangeSummaryEntry[];
}

export const initialState: ScenarioReducerState = {
  detail: null,
  impact: null,
  loading: false,
  error: null,
  stale: false,
  mutationSeq: 0,
  changeSummaryEntries: [],
};

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SET_DETAIL'; detail: ScenarioDetail; markStale?: boolean }
  | { type: 'SET_IMPACT'; impact: ImpactDashboardResponse }
  | { type: 'MARK_STALE' }
  | { type: 'CLEAR_STALE' }
  | { type: 'APPEND_CHANGE'; entry: ChangeSummaryEntry }
  | { type: 'RESET' };

// Exported for unit testing the cross-portfolio debounce state mechanics (§7).
export function reducer(state: ScenarioReducerState, action: Action): ScenarioReducerState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SET_DETAIL':
      return {
        ...state,
        loading: false,
        error: null,
        detail: action.detail,
        stale: action.markStale ?? state.stale,
      };
    case 'SET_IMPACT':
      return { ...state, impact: action.impact, stale: action.impact.stale };
    case 'MARK_STALE':
      return { ...state, stale: true, mutationSeq: state.mutationSeq + 1 };
    case 'CLEAR_STALE':
      return { ...state, stale: false };
    case 'APPEND_CHANGE':
      return {
        ...state,
        changeSummaryEntries: [action.entry, ...state.changeSummaryEntries],
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Public context shape
// ---------------------------------------------------------------------------

export interface ScenarioContextValue {
  // Identity
  scenarioId: number;
  scenarioVersion: string;
  // Data
  detail: ScenarioDetail | null;
  impact: ImpactDashboardResponse | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  changeSummaryEntries: ChangeSummaryEntry[];
  // Derived
  anchorVersionId: number | null;
  isOwner: boolean;
  canPromote: boolean;
  canApplyToForecast: boolean;
  tier3Visible: boolean;
  ccOwnerScopeCcId: string | null;
  visibility: string | null;
  archived: boolean;
  // Mutations — CRUD + lifecycle
  reload: () => Promise<void>;
  updateMetadata: (body: ScenarioMetadataBody) => Promise<void>;
  publish: (body?: ScenarioPublishBody) => Promise<void>;
  unpublish: () => Promise<void>;
  archive: (archived: boolean) => Promise<void>;
  rebase: (newAnchorVersionId: number) => Promise<void>;
  // Mutations — Actions
  applyAction: (body: ActionBody) => Promise<ScenarioDetail | null>;
  removeAction: (actionId: number) => Promise<void>;
  reorderActions: (actionIds: number[]) => Promise<void>;
  // Mutations — Project-scope cell overlay (Session 2). Each returns the
  // verbatim write response so the surface hook can reconcile its working
  // edits against the recalculated grid. Network + stale + change-feed only;
  // the working-edits Map stays in the surface hook.
  applyCellOverlay: (
    projectId: string,
    body: CellEditBody,
  ) => Promise<ScenarioGridWriteResponse>;
  revertCellOverlay: (
    projectId: string,
    ref: { line_key: string; month: string; field?: 'hours' | 'amount_eur' },
  ) => Promise<ScenarioGridWriteResponse>;
  revertLineOverlay: (
    projectId: string,
    lineKey: string,
  ) => Promise<ScenarioGridWriteResponse>;
  clearProjectOverlay: (
    projectId: string,
  ) => Promise<ScenarioGridWriteResponse>;
  // Mutations — Project-scope T1 (Session 3): role lines, plan edits, Tier-3
  // mix. Each refreshes `detail` from the write response state, marks stale, and
  // appends a change-feed entry (like applyCellOverlay). The grid is reshaped by
  // these, so the surface refetches off the returned response.
  addRoleLine: (
    projectId: string,
    body: LineAddBody,
  ) => Promise<ScenarioLineWriteResponse>;
  removeRoleLine: (
    projectId: string,
    lineKey: string,
  ) => Promise<ScenarioLineWriteResponse>;
  writePlanEdit: (
    projectId: string,
    body: PlanEditBody,
  ) => Promise<ScenarioPlanWriteResponse>;
  revertPlanEdit: (
    projectId: string,
    ref?: { target?: PlanEditBody['target']; milestone_id?: string },
  ) => Promise<ScenarioPlanWriteResponse>;
  writeMixChange: (
    projectId: string,
    body: MixChangeBody,
  ) => Promise<ScenarioMixWriteResponse>;
  revertMixChange: (
    projectId: string,
    mixId?: number,
  ) => Promise<ScenarioMixWriteResponse>;
  // Mutations — Project-scope T2 (Session 3): external-cost line items. List is
  // a plain read; add/edit/remove refresh `detail` from the write response,
  // mark stale, and append a change-feed entry (like applyCellOverlay).
  listExternalCosts: (projectId: string) => Promise<ExternalCostListResponse>;
  addExternalCost: (
    projectId: string,
    body: ExternalCostLineCreateBody,
  ) => Promise<ExternalCostWriteResponse>;
  editExternalCost: (
    projectId: string,
    lineKey: string,
    body: ExternalCostLineUpdateBody,
  ) => Promise<ExternalCostWriteResponse>;
  removeExternalCost: (
    projectId: string,
    lineKey: string,
  ) => Promise<ExternalCostWriteResponse>;
  // Mutations — Lever 12
  createDistribution: (body: DistributionEdgeCreateBody) => Promise<unknown>;
  updateDistribution: (
    edgeId: number,
    body: DistributionEdgeUpdateBody,
  ) => Promise<unknown>;
  deleteDistribution: (edgeId: number) => Promise<unknown>;
  setToBusiness: (body: ToBusinessChangeBody) => Promise<unknown>;
  setBtcLines: (body: BTCLinesChangeBody) => Promise<unknown>;
  costAllocationImpact: (year?: number) => Promise<CostAllocationImpactResponse>;
  // Recalculate + impact
  recalculate: (year?: number) => Promise<ImpactDashboardResponse | null>;
  // Promote (controller-only — gated by canPromote)
  promotePreview: (actionIds?: number[]) => Promise<PromotePreviewResponse>;
  promoteExecute: (body?: {
    action_ids?: number[];
    notes?: string;
  }) => Promise<PromoteExecuteResponse>;
  // Apply-to-forecast (PL-only — gated by canApplyToForecast)
  applyToForecast: (body?: ApplyToForecastBody) => Promise<ApplyToForecastResponse>;
  // Change summary feed
  appendChange: (entry: Omit<ChangeSummaryEntry, 'id' | 'timestamp'>) => void;
}

const ScenarioCtx = createContext<ScenarioContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProviderProps {
  scenarioId: number;
  children: ReactNode;
}

export function ScenarioProvider({ scenarioId, children }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { context } = useRole();
  const role = context?.role;
  const personId = context?.user_name; // not strictly equal — see below
  const tier3Flag = Boolean(context?.tier3_flag);
  // Note: we don't have direct person_id on the frontend role context;
  // ownership is derived from `detail.metadata.author_name` + the
  // current display name. Backend still enforces ownership server-side.
  const counterRef = useRef(0);
  const nextEntryId = useCallback(() => `ce-${++counterRef.current}`, []);

  const scenarioVersion = useMemo(
    () => buildScenarioVersion(scenarioId),
    [scenarioId],
  );

  // ---- Loading -----------------------------------------------------------
  const reload = useCallback(async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const detail = await scenariosApi.getDetail(scenarioId);
      dispatch({ type: 'SET_DETAIL', detail });
    } catch (e) {
      dispatch({
        type: 'LOAD_ERROR',
        error: e instanceof Error ? e.message : 'Failed to load scenario',
      });
    }
  }, [scenarioId]);

  useEffect(() => {
    dispatch({ type: 'RESET' });
    void reload();
  }, [reload]);

  // ---- Helpers -----------------------------------------------------------
  const appendChange = useCallback(
    (entry: Omit<ChangeSummaryEntry, 'id' | 'timestamp'>) => {
      dispatch({
        type: 'APPEND_CHANGE',
        entry: { ...entry, id: nextEntryId(), timestamp: Date.now() },
      });
    },
    [nextEntryId],
  );

  const wrapMutation = useCallback(
    async <T,>(
      run: () => Promise<T>,
      changeEntry: Omit<ChangeSummaryEntry, 'id' | 'timestamp'> | null,
      opts: { markStale?: boolean; reloadAfter?: boolean } = {},
    ): Promise<T> => {
      try {
        const result = await run();
        if (changeEntry) appendChange(changeEntry);
        if (opts.markStale ?? true) dispatch({ type: 'MARK_STALE' });
        if (opts.reloadAfter) await reload();
        return result;
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          error: e instanceof Error ? e.message : 'Mutation failed',
        });
        throw e;
      }
    },
    [appendChange, reload],
  );

  // ---- Lifecycle mutations -----------------------------------------------
  const updateMetadata = useCallback(
    async (body: ScenarioMetadataBody) => {
      await wrapMutation(
        () => scenariosApi.updateMetadata(scenarioId, body),
        {
          kind: 'metadata',
          label: 'Updated scenario metadata',
          detail: Object.keys(body).filter((k) => k !== undefined).join(', '),
        },
        { markStale: false, reloadAfter: true },
      );
    },
    [scenarioId, wrapMutation],
  );

  const publish = useCallback(
    async (body?: ScenarioPublishBody) => {
      await wrapMutation(
        () => scenariosApi.publish(scenarioId, body),
        { kind: 'lifecycle', label: 'Published scenario' },
        { markStale: false, reloadAfter: true },
      );
    },
    [scenarioId, wrapMutation],
  );

  const unpublish = useCallback(async () => {
    await wrapMutation(
      () => scenariosApi.unpublish(scenarioId),
      { kind: 'lifecycle', label: 'Unpublished scenario' },
      { markStale: false, reloadAfter: true },
    );
  }, [scenarioId, wrapMutation]);

  const archive = useCallback(
    async (archived: boolean) => {
      await wrapMutation(
        () => scenariosApi.archive(scenarioId, archived),
        {
          kind: 'lifecycle',
          label: archived ? 'Archived scenario' : 'Restored from archive',
        },
        { markStale: false, reloadAfter: true },
      );
    },
    [scenarioId, wrapMutation],
  );

  const rebase = useCallback(
    async (newAnchorVersionId: number) => {
      await wrapMutation(
        () => scenariosApi.rebase(scenarioId, { new_anchor_version_id: newAnchorVersionId }),
        {
          kind: 'lifecycle',
          label: 'Rebased to newer anchor',
          detail: `version_id=${newAnchorVersionId}`,
        },
        { markStale: true, reloadAfter: true },
      );
    },
    [scenarioId, wrapMutation],
  );

  // ---- Action mutations --------------------------------------------------
  const applyAction = useCallback(
    async (body: ActionBody): Promise<ScenarioDetail | null> => {
      try {
        dispatch({ type: 'LOAD_START' });
        const detail = await scenariosApi.applyAction(scenarioId, body);
        dispatch({ type: 'SET_DETAIL', detail, markStale: true });
        appendChange({
          kind: 'action',
          label: `Applied ${body.action_type}`,
          detail: body.scope === 'project' ? `project=${body.project_id ?? ''}` : body.scope,
        });
        return detail;
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          error: e instanceof Error ? e.message : 'Failed to apply action',
        });
        return null;
      }
    },
    [scenarioId, appendChange],
  );

  const removeAction = useCallback(
    async (actionId: number) => {
      try {
        dispatch({ type: 'LOAD_START' });
        const detail = await scenariosApi.removeAction(scenarioId, actionId);
        dispatch({ type: 'SET_DETAIL', detail, markStale: true });
        appendChange({
          kind: 'action',
          label: `Removed action #${actionId}`,
          actionId,
        });
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          error: e instanceof Error ? e.message : 'Failed to remove action',
        });
      }
    },
    [scenarioId, appendChange],
  );

  const reorderActions = useCallback(
    async (actionIds: number[]) => {
      try {
        await scenariosApi.reorderActions(scenarioId, actionIds);
        dispatch({ type: 'MARK_STALE' });
        await reload();
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          error: e instanceof Error ? e.message : 'Failed to reorder actions',
        });
      }
    },
    [scenarioId, reload],
  );

  // ---- Project-scope cell overlay (Session 2) ----------------------------
  // Thin network wrappers around the frozen overlay endpoints. Each mirrors
  // `applyAction`'s dispatch: refresh `detail` from the write response's
  // `state`, MARK_STALE, and append a change-feed entry. The surface hook owns
  // the working-edits Map and reconciles from the returned `grid`.
  const applyCellOverlay = useCallback(
    async (
      projectId: string,
      body: CellEditBody,
    ): Promise<ScenarioGridWriteResponse> => {
      const res = await scenariosApi.writeCellOverlay(scenarioId, projectId, body);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: `Edited ${body.field === 'hours' ? 'hours' : '€'} cell`,
        detail: `${projectId} · ${body.line_key} · ${body.month}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const revertCellOverlay = useCallback(
    async (
      projectId: string,
      ref: { line_key: string; month: string; field?: 'hours' | 'amount_eur' },
    ): Promise<ScenarioGridWriteResponse> => {
      const res = await scenariosApi.revertCell(scenarioId, projectId, ref);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Reverted cell edit',
        detail: `${projectId} · ${ref.line_key} · ${ref.month}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const revertLineOverlay = useCallback(
    async (
      projectId: string,
      lineKey: string,
    ): Promise<ScenarioGridWriteResponse> => {
      const res = await scenariosApi.revertLine(scenarioId, projectId, lineKey);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Reverted line edits',
        detail: `${projectId} · ${lineKey}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const clearProjectOverlay = useCallback(
    async (projectId: string): Promise<ScenarioGridWriteResponse> => {
      const res = await scenariosApi.clearProjectOverlay(scenarioId, projectId);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Reverted all cell edits',
        detail: projectId,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  // ---- Project-scope T1: role lines / plan / Tier-3 mix (Session 3) -------
  const addRoleLine = useCallback(
    async (projectId: string, body: LineAddBody): Promise<ScenarioLineWriteResponse> => {
      const res = await scenariosApi.addRoleLine(scenarioId, projectId, body);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Added role line',
        detail: `${projectId} · ${body.role_type_id}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const removeRoleLine = useCallback(
    async (projectId: string, lineKey: string): Promise<ScenarioLineWriteResponse> => {
      const res = await scenariosApi.removeRoleLine(scenarioId, projectId, lineKey);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Removed role line',
        detail: `${projectId} · ${lineKey}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const writePlanEdit = useCallback(
    async (projectId: string, body: PlanEditBody): Promise<ScenarioPlanWriteResponse> => {
      const res = await scenariosApi.writePlanEdit(scenarioId, projectId, body);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: `Edited plan (${body.target})`,
        detail: `${projectId}${body.value ? ` · ${body.value}` : ''}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const revertPlanEdit = useCallback(
    async (
      projectId: string,
      ref?: { target?: PlanEditBody['target']; milestone_id?: string },
    ): Promise<ScenarioPlanWriteResponse> => {
      const res = await scenariosApi.revertPlanEdit(scenarioId, projectId, ref);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Reverted plan edit',
        detail: `${projectId}${ref?.target ? ` · ${ref.target}` : ''}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const writeMixChange = useCallback(
    async (projectId: string, body: MixChangeBody): Promise<ScenarioMixWriteResponse> => {
      const res = await scenariosApi.writeMixChange(scenarioId, projectId, body);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Changed seniority/sourcing mix',
        detail: `${projectId} · ${body.swap_from_role_id} → ${body.swap_to_role_id}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const revertMixChange = useCallback(
    async (projectId: string, mixId?: number): Promise<ScenarioMixWriteResponse> => {
      const res = await scenariosApi.revertMixChange(scenarioId, projectId, mixId);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Reverted mix change',
        detail: projectId,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  // ---- Project-scope T2: external-cost line items (Session 3) -------------
  const listExternalCosts = useCallback(
    (projectId: string): Promise<ExternalCostListResponse> =>
      scenariosApi.listExternalCosts(scenarioId, projectId),
    [scenarioId],
  );

  const addExternalCost = useCallback(
    async (
      projectId: string,
      body: ExternalCostLineCreateBody,
    ): Promise<ExternalCostWriteResponse> => {
      const res = await scenariosApi.addExternalCost(scenarioId, projectId, body);
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Added external-cost line',
        detail: `${projectId}${body.vendor ? ` · ${body.vendor}` : ''}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const editExternalCost = useCallback(
    async (
      projectId: string,
      lineKey: string,
      body: ExternalCostLineUpdateBody,
    ): Promise<ExternalCostWriteResponse> => {
      const res = await scenariosApi.editExternalCost(
        scenarioId, projectId, lineKey, body,
      );
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Edited external-cost line',
        detail: `${projectId} · ${lineKey}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  const removeExternalCost = useCallback(
    async (
      projectId: string,
      lineKey: string,
    ): Promise<ExternalCostWriteResponse> => {
      const res = await scenariosApi.removeExternalCost(
        scenarioId, projectId, lineKey,
      );
      dispatch({ type: 'SET_DETAIL', detail: res.state, markStale: true });
      appendChange({
        kind: 'action',
        label: 'Removed external-cost line',
        detail: `${projectId} · ${lineKey}`,
      });
      return res;
    },
    [scenarioId, appendChange],
  );

  // ---- Lever 12 mutations ------------------------------------------------
  const createDistribution = useCallback(
    (body: DistributionEdgeCreateBody) =>
      wrapMutation(
        () => scenariosApi.createDistribution(scenarioId, body),
        {
          kind: 'lever12_distribution',
          label: `Added Stage 1 edge ${body.source_entity_id} → ${body.destination_entity_id}`,
          detail: `${body.percentage}%`,
        },
      ),
    [scenarioId, wrapMutation],
  );

  const updateDistribution = useCallback(
    (edgeId: number, body: DistributionEdgeUpdateBody) =>
      wrapMutation(
        () => scenariosApi.updateDistribution(scenarioId, edgeId, body),
        {
          kind: 'lever12_distribution',
          label: `Updated Stage 1 edge #${edgeId}`,
          detail: `${body.percentage}%`,
        },
      ),
    [scenarioId, wrapMutation],
  );

  const deleteDistribution = useCallback(
    (edgeId: number) =>
      wrapMutation(
        () => scenariosApi.deleteDistribution(scenarioId, edgeId),
        {
          kind: 'lever12_distribution',
          label: `Deleted Stage 1 edge #${edgeId}`,
        },
      ),
    [scenarioId, wrapMutation],
  );

  const setToBusiness = useCallback(
    (body: ToBusinessChangeBody) =>
      wrapMutation(
        () => scenariosApi.setToBusiness(scenarioId, body),
        {
          kind: 'lever12_to_business',
          label: `Set to-business ${body.entity_id}`,
          detail: `${body.new_pct}% (${body.year})`,
        },
      ),
    [scenarioId, wrapMutation],
  );

  const setBtcLines = useCallback(
    (body: BTCLinesChangeBody) =>
      wrapMutation(
        () => scenariosApi.setBtcLines(scenarioId, body),
        {
          kind: 'lever12_btc',
          label: `Updated Stage 2 BTC for ${body.entity_id}`,
          detail: `${body.lines.length} lines (${body.year})`,
        },
      ),
    [scenarioId, wrapMutation],
  );

  const costAllocationImpact = useCallback(
    (year?: number) => scenariosApi.costAllocationImpact(scenarioId, year),
    [scenarioId],
  );

  // ---- Recalculate + impact ---------------------------------------------
  // Remember the last year the impact dashboard was computed for, so the
  // debounced auto-recompute (§7) refreshes the same year the user is
  // viewing rather than snapping back to the default.
  const lastImpactYearRef = useRef<number>(2026);
  const recalculate = useCallback(
    async (year?: number): Promise<ImpactDashboardResponse | null> => {
      try {
        const resolvedYear = year ?? lastImpactYearRef.current;
        lastImpactYearRef.current = resolvedYear;
        dispatch({ type: 'LOAD_START' });
        await scenariosApi.recalculate(scenarioId);
        const impact = await scenariosApi.impact(scenarioId, resolvedYear);
        dispatch({ type: 'SET_IMPACT', impact });
        dispatch({ type: 'CLEAR_STALE' });
        return impact;
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          error: e instanceof Error ? e.message : 'Recalculate failed',
        });
        return null;
      }
    },
    [scenarioId],
  );

  // Debounced cross-portfolio feedback (§7). The project's own financials
  // (line totals / budget / delta / RAG) move live in the surfaces; the
  // expensive cross-portfolio dimensions — capacity, backlog ranking,
  // investment mix, outsourcing ratio — live in the impact dashboard and
  // refresh here ~1s after editing pauses. Each diff-changing mutation bumps
  // `mutationSeq`, resetting the timer; a manual Recalculate flips `stale`
  // false, whose cleanup cancels any pending auto-recompute. Gated on
  // `stale` so a scenario switch / fresh load never triggers a stray fire.
  const RECOMPUTE_DEBOUNCE_MS = 1000;
  useEffect(() => {
    if (!state.stale || state.mutationSeq === 0) return;
    const timer = setTimeout(() => {
      void recalculate(lastImpactYearRef.current);
    }, RECOMPUTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.mutationSeq, state.stale, recalculate]);

  // ---- Promote -----------------------------------------------------------
  const promotePreview = useCallback(
    (actionIds?: number[]) => scenariosApi.promotePreview(scenarioId, actionIds),
    [scenarioId],
  );

  const promoteExecute = useCallback(
    async (body?: { action_ids?: number[]; notes?: string }) => {
      const result = await scenariosApi.promoteExecute(scenarioId, body);
      appendChange({
        kind: 'promote',
        label: `Promoted ${result.promoted_count} action(s)`,
        detail: result.skipped_count > 0 ? `${result.skipped_count} skipped` : undefined,
      });
      await reload();
      return result;
    },
    [scenarioId, appendChange, reload],
  );

  // ---- Apply-to-forecast ------------------------------------------------
  const applyToForecast = useCallback(
    async (body?: ApplyToForecastBody) => {
      const result = await scenariosApi.applyToForecast(scenarioId, body);
      appendChange({
        kind: 'apply',
        label: `Carried ${result.diffs_carried_forward} diff(s) into forecast`,
        detail: result.diffs_skipped > 0 ? `${result.diffs_skipped} skipped` : undefined,
      });
      return result;
    },
    [scenarioId, appendChange],
  );

  // ---- Derived values ---------------------------------------------------
  const detail = state.detail;
  const meta = detail?.metadata as
    | (ScenarioDetail['metadata'] & {
        anchor_forecast_version_id?: number | null;
        cc_owner_scope_cc_id?: string | null;
        visibility?: string | null;
        archived?: boolean;
        tier3_content_flag?: boolean;
        last_recalculated_at?: string | null;
      })
    | undefined;

  const anchorVersionId = meta?.anchor_forecast_version_id ?? null;
  const ccOwnerScopeCcId = meta?.cc_owner_scope_cc_id ?? null;
  const visibility = meta?.visibility ?? null;
  const archived = Boolean(meta?.archived);

  // Owner check: backend enforces; frontend is best-effort. If detail
  // hasn't loaded yet, assume not-owner (safer).
  const isOwner = useMemo(() => {
    if (!detail || !context) return false;
    return detail.metadata.author_name === context.user_name;
  }, [detail, context]);

  const canPromote = role === 'controller';
  const canApplyToForecast = role === 'project_lead';

  const tier3Visible = useMemo(() => {
    // Trust impact response when present.
    if (state.impact) return state.impact.tier3_visible;
    return tier3Flag;
  }, [state.impact, tier3Flag]);

  // Suppress unused-var warning while we keep personId reserved for future
  // owner-id resolution once backend exposes person_id on RoleContext.
  void personId;

  const value: ScenarioContextValue = {
    scenarioId,
    scenarioVersion,
    detail: state.detail,
    impact: state.impact,
    loading: state.loading,
    error: state.error,
    stale: state.stale,
    changeSummaryEntries: state.changeSummaryEntries,
    anchorVersionId,
    isOwner,
    canPromote,
    canApplyToForecast,
    tier3Visible,
    ccOwnerScopeCcId,
    visibility,
    archived,
    reload,
    updateMetadata,
    publish,
    unpublish,
    archive,
    rebase,
    applyAction,
    removeAction,
    reorderActions,
    applyCellOverlay,
    revertCellOverlay,
    revertLineOverlay,
    clearProjectOverlay,
    addRoleLine,
    removeRoleLine,
    writePlanEdit,
    revertPlanEdit,
    writeMixChange,
    revertMixChange,
    listExternalCosts,
    addExternalCost,
    editExternalCost,
    removeExternalCost,
    createDistribution,
    updateDistribution,
    deleteDistribution,
    setToBusiness,
    setBtcLines,
    costAllocationImpact,
    recalculate,
    promotePreview,
    promoteExecute,
    applyToForecast,
    appendChange,
  };

  return <ScenarioCtx.Provider value={value}>{children}</ScenarioCtx.Provider>;
}

/** Internal accessor; surfaces should use {@link useScenarioContext}. */
export function useScenarioContextRaw(): ScenarioContextValue | null {
  return useContext(ScenarioCtx);
}

export { ScenarioCtx };
export { parseScenarioVersion };
