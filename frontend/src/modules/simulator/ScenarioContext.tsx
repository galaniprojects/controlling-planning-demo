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
  type CostAllocationImpactResponse,
  type DistributionEdgeCreateBody,
  type DistributionEdgeUpdateBody,
  type ImpactDashboardResponse,
  type PromoteExecuteResponse,
  type PromotePreviewResponse,
  type ScenarioMetadataBody,
  type ScenarioPublishBody,
  type ToBusinessChangeBody,
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
  changeSummaryEntries: ChangeSummaryEntry[];
}

const initialState: ScenarioReducerState = {
  detail: null,
  impact: null,
  loading: false,
  error: null,
  stale: false,
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

function reducer(state: ScenarioReducerState, action: Action): ScenarioReducerState {
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
      return { ...state, stale: true };
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
  const recalculate = useCallback(
    async (year?: number): Promise<ImpactDashboardResponse | null> => {
      try {
        dispatch({ type: 'LOAD_START' });
        await scenariosApi.recalculate(scenarioId);
        const impact = await scenariosApi.impact(scenarioId, year ?? 2026);
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
