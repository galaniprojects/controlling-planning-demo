import { useReducer, useCallback, useEffect, useRef } from 'react';
import { scenariosApi } from '@/api/endpoints';
import type { ScenarioDetail } from '@/types/api';

// --- State ---

interface ScenarioWorkspaceState {
  loading: boolean;
  error: string | null;
  scenario: ScenarioDetail | null;
}

const initialState: ScenarioWorkspaceState = {
  loading: false,
  error: null,
  scenario: null,
};

// --- Actions ---

type ScenarioStateAction =
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_SCENARIO'; payload: ScenarioDetail }
  | {
      type: 'UPDATE_METADATA';
      name?: string;
      description?: string;
    }
  | { type: 'RESET' };

// --- Reducer ---

function reducer(
  state: ScenarioWorkspaceState,
  action: ScenarioStateAction,
): ScenarioWorkspaceState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };
    case 'SET_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_SCENARIO':
      return { loading: false, error: null, scenario: action.payload };
    case 'UPDATE_METADATA': {
      if (!state.scenario) return state;
      return {
        ...state,
        scenario: {
          ...state.scenario,
          metadata: {
            ...state.scenario.metadata,
            ...(action.name !== undefined && { name: action.name }),
            ...(action.description !== undefined && {
              description: action.description,
            }),
          },
        },
      };
    }
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// --- Hook ---

export function useScenarioState(scenarioId: number | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const loadedRef = useRef<number | null>(null);

  const loadScenario = useCallback(async () => {
    if (scenarioId === null) return;
    dispatch({ type: 'SET_LOADING' });
    try {
      const result = await scenariosApi.getDetail(scenarioId);
      dispatch({ type: 'SET_SCENARIO', payload: result });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: e instanceof Error ? e.message : 'Failed to load scenario',
      });
    }
  }, [scenarioId]);

  const updateMetadata = useCallback(
    async (name?: string, description?: string) => {
      if (scenarioId === null) return;
      // Optimistic local update
      dispatch({ type: 'UPDATE_METADATA', name, description });
      try {
        await scenariosApi.updateMetadata(scenarioId, { name, description });
      } catch (e) {
        dispatch({
          type: 'SET_ERROR',
          payload:
            e instanceof Error ? e.message : 'Failed to update metadata',
        });
      }
    },
    [scenarioId],
  );

  const applyAction = useCallback(
    async (body: {
      scope: string;
      action_type: string;
      project_id?: string;
      parameters: Record<string, unknown>;
    }) => {
      if (scenarioId === null) return;
      dispatch({ type: 'SET_LOADING' });
      try {
        const result = await scenariosApi.applyAction(scenarioId, body);
        dispatch({ type: 'SET_SCENARIO', payload: result });
      } catch (e) {
        dispatch({
          type: 'SET_ERROR',
          payload: e instanceof Error ? e.message : 'Failed to apply action',
        });
      }
    },
    [scenarioId],
  );

  const removeAction = useCallback(
    async (actionId: number) => {
      if (scenarioId === null) return;
      dispatch({ type: 'SET_LOADING' });
      try {
        const result = await scenariosApi.removeAction(scenarioId, actionId);
        dispatch({ type: 'SET_SCENARIO', payload: result });
      } catch (e) {
        dispatch({
          type: 'SET_ERROR',
          payload: e instanceof Error ? e.message : 'Failed to remove action',
        });
      }
    },
    [scenarioId],
  );

  const reorderActions = useCallback(
    async (actionIds: number[]) => {
      if (scenarioId === null) return;
      try {
        await scenariosApi.reorderActions(scenarioId, actionIds);
      } catch (e) {
        dispatch({
          type: 'SET_ERROR',
          payload:
            e instanceof Error ? e.message : 'Failed to reorder actions',
        });
      }
    },
    [scenarioId],
  );

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Auto-load when scenarioId changes
  useEffect(() => {
    if (scenarioId === null) {
      dispatch({ type: 'RESET' });
      loadedRef.current = null;
      return;
    }
    if (loadedRef.current === scenarioId) return;
    loadedRef.current = scenarioId;
    loadScenario();
  }, [scenarioId, loadScenario]);

  return {
    state,
    loadScenario,
    updateMetadata,
    applyAction,
    removeAction,
    reorderActions,
    reset,
  };
}
