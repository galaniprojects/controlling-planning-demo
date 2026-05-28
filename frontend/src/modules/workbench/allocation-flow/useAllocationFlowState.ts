/**
 * Allocation Flow — UI state reducer + React hook wrapper.
 *
 * Owns: per-side depth caps, "Show full chain" toggle, hover state,
 * legend open/closed (sessionStorage-backed key
 * `creta:allocFlow:legendOpen`, default open per `[AF-08]`), and the
 * selected `DistributionVersion` id. Resets the depth + hover state
 * when the focal entity changes.
 *
 * `reducer` and `initialState` are exported pure functions so they
 * can be unit-tested under `node --test` without a React runtime.
 */
import { useEffect, useReducer } from 'react';

export const LEGEND_STORAGE_KEY = 'creta:allocFlow:legendOpen';

/** Reasonable upper bound — `buildLayout` further caps at MAX_LAYOUT_DEPTH. */
const SHOW_FULL_CHAIN_DEPTH = 99;

export interface AllocationFlowState {
  /** Direct upstream = 1; bumped via expand_up / show_full_chain. */
  expandedDepthUp: number;
  expandedDepthDown: number;
  /** Driven by ShowFullChainToggle — also bumps the depth caps. */
  showFullChain: boolean;
  /** `src→dst` key — see edgeGeometry.edgeKey. */
  hoverEdgeKey: string | null;
  hoverNodeId: string | null;
  legendOpen: boolean;
  selectedVersionId: number | null;
}

export type AllocationFlowAction =
  | { type: 'expand_up' }
  | { type: 'expand_down' }
  | { type: 'reset_depth' }
  | { type: 'set_show_full_chain'; value: boolean }
  | { type: 'set_hover_edge'; key: string | null }
  | { type: 'set_hover_node'; id: string | null }
  | { type: 'toggle_legend' }
  | { type: 'set_legend_open'; value: boolean }
  | { type: 'set_version'; id: number | null };

function readLegendDefault(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.sessionStorage.getItem(LEGEND_STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export function initialState(): AllocationFlowState {
  return {
    expandedDepthUp: 1,
    expandedDepthDown: 1,
    showFullChain: false,
    hoverEdgeKey: null,
    hoverNodeId: null,
    legendOpen: readLegendDefault(),
    selectedVersionId: null,
  };
}

export function reducer(
  state: AllocationFlowState,
  action: AllocationFlowAction,
): AllocationFlowState {
  switch (action.type) {
    case 'expand_up':
      return {
        ...state,
        expandedDepthUp: state.expandedDepthUp + 1,
        // Manual expansion turns off the show-full-chain flag — it's
        // now under fine-grained control again.
        showFullChain: false,
      };
    case 'expand_down':
      return {
        ...state,
        expandedDepthDown: state.expandedDepthDown + 1,
        showFullChain: false,
      };
    case 'reset_depth':
      return {
        ...state,
        expandedDepthUp: 1,
        expandedDepthDown: 1,
        showFullChain: false,
        hoverEdgeKey: null,
        hoverNodeId: null,
      };
    case 'set_show_full_chain':
      if (action.value) {
        return {
          ...state,
          showFullChain: true,
          expandedDepthUp: SHOW_FULL_CHAIN_DEPTH,
          expandedDepthDown: SHOW_FULL_CHAIN_DEPTH,
        };
      }
      return {
        ...state,
        showFullChain: false,
        expandedDepthUp: 1,
        expandedDepthDown: 1,
      };
    case 'set_hover_edge':
      if (state.hoverEdgeKey === action.key) return state;
      return { ...state, hoverEdgeKey: action.key };
    case 'set_hover_node':
      if (state.hoverNodeId === action.id) return state;
      return { ...state, hoverNodeId: action.id };
    case 'toggle_legend':
      return { ...state, legendOpen: !state.legendOpen };
    case 'set_legend_open':
      return { ...state, legendOpen: action.value };
    case 'set_version':
      return { ...state, selectedVersionId: action.id };
    default: {
      // Exhaustive check.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * React wrapper around the pure reducer.
 *
 * - Resets the per-entity state (depth + hover) whenever `entityId`
 *   changes, so jumping between cascades doesn't carry stale state.
 * - Mirrors `legendOpen` to sessionStorage so the user's preference
 *   survives in-session navigation between cascades.
 */
export function useAllocationFlowState(entityId: string | null) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    dispatch({ type: 'reset_depth' });
  }, [entityId]);

  // Mirror legendOpen → sessionStorage on every change. The deps array
  // includes the initial mount run, so first-session users (storage
  // empty → default true) get their preference recorded immediately.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        LEGEND_STORAGE_KEY,
        state.legendOpen ? '1' : '0',
      );
    } catch {
      /* sessionStorage may be unavailable (Safari private mode etc.) — swallow. */
    }
  }, [state.legendOpen]);

  return { state, dispatch };
}
