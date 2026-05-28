/**
 * Reducer + action types for the rebuilt Distribution Editor
 * (Wave B / Session 5). Extracted from the component so the state
 * transitions are testable in isolation and stay readable as features
 * are added.
 *
 * State model (mirrors the plan):
 *   serverSnapshot  → { summary?, cascade } loaded from chargingApi
 *   pending         → { rows[], toBusinessPct }
 *   ui              → { sidePanelOpen, pickerOpen, focused row, saving, error }
 *
 * Pending rows include three forms (see `PendingRow` below):
 *   existing       — edgeId != null, percentage/rationale may differ from server
 *   existing-soft-deleted — edgeId != null, isDeleted=true (hidden in UI;
 *                    surfaces in the save mutation plan)
 *   new            — edgeId === null, isNew=true; needs a candidate-supplied
 *                    destination triple (id/name/identifier/type) so it can
 *                    render before the post-save refetch reseats it.
 *
 * The reducer never mutates state in place — every branch returns a
 * fresh object so React's bail-out works.
 */

import type {
  CascadeChainResponse,
  ChargeableEntityItem,
  ChargeableEntityType,
  DistributionVersionResponse,
} from '@/types/api';
import type { ParsedAllocationError } from '../errors/parseAllocationError';

export interface PendingRow {
  /** Stable row id — `edge-<edgeId>` for existing, `new-<n>` for new. */
  key: string;
  /** FK into distributions.id. NULL = unsaved new row. */
  edgeId: number | null;
  destinationId: string;
  destinationName: string;
  destinationIdentifier: string;
  destinationType: ChargeableEntityType;
  percentage: number;
  rationale: string;
  /** Edge-count of the longest path through this edge. NULL = cache miss. */
  chainDepth: number | null;
  /** True when chainDepth is at the cap−1 boundary. */
  nearMaxDepthWarning: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

export interface EditorState {
  loading: boolean;
  loadError: string | null;
  cascade: CascadeChainResponse | null;
  entity: ChargeableEntityItem | null;
  versions: DistributionVersionResponse[];
  inForceVersionId: number | null;
  resolvedVersionId: number | null;
  pending: {
    rows: PendingRow[];
    toBusinessPct: number;
    /** Counter for generating unique new-row keys within this entity. */
    nextNewIndex: number;
  };
  ui: {
    sidePanelOpen: boolean;
    pickerOpen: boolean;
    activeRowFocusKey: string | null;
    saving: boolean;
    saveError: ParsedAllocationError | null;
  };
}

export type EditorAction =
  | { type: 'RESET_FOR_ENTITY' }
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_OK';
      cascade: CascadeChainResponse;
      entity: ChargeableEntityItem;
      versions: DistributionVersionResponse[];
      inForceVersionId: number | null;
    }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SET_ROW_PCT'; key: string; value: number }
  | { type: 'SET_ROW_RATIONALE'; key: string; value: string }
  | { type: 'ADD_ROW'; row: Omit<PendingRow, 'key' | 'isNew' | 'isDeleted'> }
  | { type: 'DELETE_ROW'; key: string }
  | { type: 'SET_TBP'; value: number }
  | { type: 'DISCARD' }
  | { type: 'TOGGLE_SIDE_PANEL' }
  | { type: 'OPEN_PICKER' }
  | { type: 'CLOSE_PICKER' }
  | { type: 'FOCUS_ROW'; key: string | null }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_ERROR'; error: ParsedAllocationError }
  | { type: 'CLEAR_SAVE_ERROR' };

export const initialEditorState: EditorState = {
  loading: true,
  loadError: null,
  cascade: null,
  entity: null,
  versions: [],
  inForceVersionId: null,
  resolvedVersionId: null,
  pending: {
    rows: [],
    toBusinessPct: 0,
    nextNewIndex: 0,
  },
  ui: {
    sidePanelOpen: false,
    pickerOpen: false,
    activeRowFocusKey: null,
    saving: false,
    saveError: null,
  },
};

/**
 * Seed the pending state from a fresh cascade response. Used on initial
 * load, on version switch, and on successful save.
 */
export function pendingFromCascade(
  cascade: CascadeChainResponse,
): EditorState['pending'] {
  const downstreamById = new Map(cascade.downstream.map((n) => [n.entity_id, n]));
  const outgoingEdges = cascade.edges.filter(
    (e) => e.source_entity_id === cascade.focal.entity_id,
  );
  const rows: PendingRow[] = outgoingEdges.map((e) => {
    const dest = downstreamById.get(e.destination_entity_id);
    const depth = e.chain_depth ?? null;
    return {
      key: `edge-${edgeIdFromCascade(cascade, e)}`,
      edgeId: edgeIdFromCascade(cascade, e),
      destinationId: e.destination_entity_id,
      destinationName: dest?.entity_name ?? e.destination_entity_id,
      destinationIdentifier: dest?.identifier ?? e.destination_entity_id,
      destinationType: (dest?.entity_type ?? 'InternalService') as ChargeableEntityType,
      percentage: e.percentage,
      rationale: e.rationale ?? '',
      chainDepth: depth,
      nearMaxDepthWarning:
        depth != null && depth >= cascade.max_allocation_depth - 1,
      isNew: false,
      isDeleted: false,
    };
  });
  return {
    rows,
    toBusinessPct: cascade.focal.to_business_pct,
    nextNewIndex: 0,
  };
}

/**
 * The cascade schema doesn't carry the distribution edge primary-key
 * directly — it's the row that matches (version_id, source, destination)
 * in the targeted version. The editor needs the edge id for updates and
 * deletes; we fetch it separately via the summary endpoint. To avoid a
 * second round trip during the cascade response, this helper assumes the
 * caller will resolve `edgeId` from the parallel-loaded summary. For
 * now it returns -1 as a sentinel; the editor patches the resolved id
 * in via `attachEdgeIds` below.
 *
 * NOTE: keeping this layer thin so a single source change (e.g. cascade
 * starts including the edge id) is trivial to swap.
 */
function edgeIdFromCascade(
  _cascade: CascadeChainResponse,
  _edge: CascadeChainResponse['edges'][number],
): number {
  return -1;
}

/**
 * After cascade hydration, the editor calls the summary endpoint to
 * recover the edge primary keys (cascade carries source/dest/pct but
 * not the pk). This walks the pending rows and patches them. Pure.
 */
export function attachEdgeIds(
  pending: EditorState['pending'],
  edgeIdByDestId: Map<string, number>,
): EditorState['pending'] {
  return {
    ...pending,
    rows: pending.rows.map((r, idx) => {
      if (r.isNew || r.edgeId !== null) return r;
      const id = edgeIdByDestId.get(r.destinationId);
      if (id === undefined) return r;
      return {
        ...r,
        edgeId: id,
        // re-key with the resolved id so the row's key stays stable
        // through edits and post-save refetches.
        key: `edge-${id}-${idx}`,
      };
    }),
  };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case 'RESET_FOR_ENTITY':
      return { ...initialEditorState };

    case 'LOAD_START':
      return { ...state, loading: true, loadError: null };

    case 'LOAD_OK': {
      const pending = pendingFromCascade(action.cascade);
      return {
        ...state,
        loading: false,
        loadError: null,
        cascade: action.cascade,
        entity: action.entity,
        versions: action.versions,
        inForceVersionId: action.inForceVersionId,
        resolvedVersionId: action.cascade.version.id,
        pending,
        ui: {
          ...state.ui,
          saveError: null,
          // keep sidePanelOpen if it was already open and entity didn't change
          activeRowFocusKey: null,
        },
      };
    }

    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        loadError: action.message,
      };

    case 'SET_ROW_PCT': {
      return updateRow(state, action.key, (r) => ({
        ...r,
        percentage: action.value,
      }));
    }

    case 'SET_ROW_RATIONALE':
      return updateRow(state, action.key, (r) => ({
        ...r,
        rationale: action.value,
      }));

    case 'ADD_ROW': {
      const idx = state.pending.nextNewIndex;
      const key = `new-${idx}`;
      const row: PendingRow = {
        ...action.row,
        key,
        edgeId: null,
        isNew: true,
        isDeleted: false,
      };
      return {
        ...state,
        pending: {
          ...state.pending,
          rows: [...state.pending.rows, row],
          nextNewIndex: idx + 1,
        },
        ui: {
          ...state.ui,
          pickerOpen: false,
          activeRowFocusKey: key,
          saveError: null,
        },
      };
    }

    case 'DELETE_ROW': {
      const rows: PendingRow[] = [];
      for (const r of state.pending.rows) {
        if (r.key !== action.key) {
          rows.push(r);
          continue;
        }
        // New row → drop entirely. Existing row → soft-delete.
        if (r.isNew) continue;
        rows.push({ ...r, isDeleted: true });
      }
      return {
        ...state,
        pending: { ...state.pending, rows },
        ui: {
          ...state.ui,
          activeRowFocusKey:
            state.ui.activeRowFocusKey === action.key
              ? null
              : state.ui.activeRowFocusKey,
        },
      };
    }

    case 'SET_TBP':
      return {
        ...state,
        pending: { ...state.pending, toBusinessPct: action.value },
      };

    case 'DISCARD':
      if (!state.cascade) return state;
      return {
        ...state,
        pending: pendingFromCascade(state.cascade),
        ui: {
          ...state.ui,
          saveError: null,
          activeRowFocusKey: null,
        },
      };

    case 'TOGGLE_SIDE_PANEL':
      return {
        ...state,
        ui: { ...state.ui, sidePanelOpen: !state.ui.sidePanelOpen },
      };

    case 'OPEN_PICKER':
      return { ...state, ui: { ...state.ui, pickerOpen: true } };

    case 'CLOSE_PICKER':
      return { ...state, ui: { ...state.ui, pickerOpen: false } };

    case 'FOCUS_ROW':
      return { ...state, ui: { ...state.ui, activeRowFocusKey: action.key } };

    case 'SAVE_START':
      return {
        ...state,
        ui: { ...state.ui, saving: true, saveError: null },
      };

    case 'SAVE_ERROR':
      return {
        ...state,
        ui: { ...state.ui, saving: false, saveError: action.error },
      };

    case 'CLEAR_SAVE_ERROR':
      return { ...state, ui: { ...state.ui, saveError: null } };

    default:
      return state;
  }
}

function updateRow(
  state: EditorState,
  key: string,
  patch: (row: PendingRow) => PendingRow,
): EditorState {
  const rows = state.pending.rows.map((r) => (r.key === key ? patch(r) : r));
  return {
    ...state,
    pending: { ...state.pending, rows },
  };
}

/**
 * True when a row's percentage or rationale differs from the server
 * snapshot. Used by the table + side panel to apply the "edited" accent
 * highlight (spec §5.7).
 */
export function rowIsEdited(
  row: PendingRow,
  cascade: CascadeChainResponse | null,
): boolean {
  if (row.isNew) return true;
  if (row.isDeleted) return true;
  if (!cascade) return false;
  const serverEdge = cascade.edges.find(
    (e) =>
      e.source_entity_id === cascade.focal.entity_id &&
      e.destination_entity_id === row.destinationId,
  );
  if (!serverEdge) return true;
  if (Math.abs(serverEdge.percentage - row.percentage) > 0.0001) return true;
  if ((serverEdge.rationale ?? '').trim() !== (row.rationale ?? '').trim()) return true;
  return false;
}
