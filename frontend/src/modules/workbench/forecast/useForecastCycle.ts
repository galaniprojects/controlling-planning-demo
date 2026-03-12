import { useReducer, useCallback } from 'react';
import { workbenchApi } from '@/api/endpoints';
import type {
  RetrospectiveItem,
  SuggestionItem,
  ForecastChange,
  ReviewGroup,
  ReviewGridData,
  CostCentreGroup,
  SubmittedCR,
  ForecastCycleStartResponse,
} from '@/types/api';

// --- State ---

export interface ForecastCycleState {
  phase: 1 | 2 | 3 | 4 | 5;
  cycleId: string | null;
  loading: boolean;
  error: string | null;

  // Phase 1
  retrospective: RetrospectiveItem[];
  skippable: boolean;
  explanations: Record<string, string>;

  // Phase 2
  suggestions: SuggestionItem[];
  appliedSuggestionIds: number[];
  dismissedSuggestionIds: number[];

  // Phase 3
  workingChanges: ForecastChange[];

  // Phase 4
  reviewGroups: ReviewGroup[];
  reviewGridData: ReviewGridData | null;
  costCentreGroups: CostCentreGroup[];
  justifications: Record<string, string>;

  // Phase 5
  submittedCRs: SubmittedCR[];
}

const initialState: ForecastCycleState = {
  phase: 1,
  cycleId: null,
  loading: false,
  error: null,
  retrospective: [],
  skippable: true,
  explanations: {},
  suggestions: [],
  appliedSuggestionIds: [],
  dismissedSuggestionIds: [],
  workingChanges: [],
  reviewGroups: [],
  reviewGridData: null,
  costCentreGroups: [],
  justifications: {},
  submittedCRs: [],
};

// --- Actions ---

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'START_CYCLE'; payload: ForecastCycleStartResponse }
  | { type: 'SET_EXPLANATION'; key: string; text: string }
  | { type: 'ACKNOWLEDGE_RETRO' }
  | { type: 'SKIP_RETRO' }
  | { type: 'SET_SUGGESTIONS'; payload: SuggestionItem[] }
  | { type: 'APPLY_SUGGESTION'; id: number }
  | { type: 'DISMISS_SUGGESTION'; id: number }
  | { type: 'ADVANCE_TO_EDIT' }
  | { type: 'UPDATE_CELL'; payload: ForecastChange }
  | { type: 'SET_REVIEW_GROUPS'; payload: ReviewGroup[]; gridData?: ReviewGridData; ccGroups?: CostCentreGroup[] }
  | { type: 'SET_JUSTIFICATION'; groupType: string; text: string }
  | { type: 'SUBMIT_SUCCESS'; payload: SubmittedCR[] }
  | { type: 'GO_BACK' }
  | { type: 'RESET' };

// --- Reducer ---

function reducer(state: ForecastCycleState, action: Action): ForecastCycleState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    case 'START_CYCLE':
      return {
        ...initialState,
        phase: 1,
        cycleId: action.payload.cycle_id,
        retrospective: action.payload.retrospective_data,
        skippable: action.payload.skippable,
        loading: false,
      };

    case 'SET_EXPLANATION':
      return {
        ...state,
        explanations: { ...state.explanations, [action.key]: action.text },
      };

    case 'ACKNOWLEDGE_RETRO':
    case 'SKIP_RETRO':
      return { ...state, phase: 2, loading: false };

    case 'SET_SUGGESTIONS':
      return {
        ...state,
        suggestions: action.payload,
        phase: action.payload.length === 0 ? 3 : 2,
        loading: false,
      };

    case 'APPLY_SUGGESTION':
      return {
        ...state,
        appliedSuggestionIds: [...state.appliedSuggestionIds, action.id],
        dismissedSuggestionIds: state.dismissedSuggestionIds.filter(
          (id) => id !== action.id,
        ),
      };

    case 'DISMISS_SUGGESTION':
      return {
        ...state,
        dismissedSuggestionIds: [...state.dismissedSuggestionIds, action.id],
        appliedSuggestionIds: state.appliedSuggestionIds.filter(
          (id) => id !== action.id,
        ),
      };

    case 'ADVANCE_TO_EDIT':
      return { ...state, phase: 3 };

    case 'UPDATE_CELL': {
      const idx = state.workingChanges.findIndex(
        (c) =>
          c.sub_category === action.payload.sub_category &&
          c.month === action.payload.month,
      );
      const updated = [...state.workingChanges];
      if (idx >= 0) updated[idx] = action.payload;
      else updated.push(action.payload);
      return { ...state, workingChanges: updated };
    }

    case 'SET_REVIEW_GROUPS':
      return {
        ...state,
        reviewGroups: action.payload,
        reviewGridData: action.gridData ?? null,
        costCentreGroups: action.ccGroups ?? [],
        phase: 4,
        loading: false,
      };

    case 'SET_JUSTIFICATION':
      return {
        ...state,
        justifications: {
          ...state.justifications,
          [action.groupType]: action.text,
        },
      };

    case 'SUBMIT_SUCCESS':
      return { ...state, submittedCRs: action.payload, phase: 5, loading: false };

    case 'GO_BACK':
      if (state.phase > 1) {
        return { ...state, phase: (state.phase - 1) as 1 | 2 | 3 | 4 | 5 };
      }
      return state;

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// --- Hook ---

export function useForecastCycle(projectId: string) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const startCycle = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await workbenchApi.startCycle(projectId);
      dispatch({ type: 'START_CYCLE', payload: result });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: (e as Error).message || 'Failed to start forecast cycle',
      });
    }
  }, [projectId]);

  const setExplanation = useCallback((key: string, text: string) => {
    dispatch({ type: 'SET_EXPLANATION', key, text });
  }, []);

  const acknowledgeRetrospective = useCallback(async () => {
    if (!state.cycleId) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await workbenchApi.acknowledgeRetrospective(
        projectId,
        state.cycleId,
        state.explanations,
      );
      dispatch({ type: 'ACKNOWLEDGE_RETRO' });
      // Immediately fetch suggestions
      const sugRes = await workbenchApi.getSuggestions(projectId, state.cycleId);
      dispatch({ type: 'SET_SUGGESTIONS', payload: sugRes.items });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: (e as Error).message || 'Failed to acknowledge',
      });
    }
  }, [projectId, state.cycleId, state.explanations]);

  const skipRetrospective = useCallback(async () => {
    if (!state.cycleId) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await workbenchApi.acknowledgeRetrospective(
        projectId,
        state.cycleId,
        {},
      );
      dispatch({ type: 'SKIP_RETRO' });
      const sugRes = await workbenchApi.getSuggestions(projectId, state.cycleId);
      dispatch({ type: 'SET_SUGGESTIONS', payload: sugRes.items });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: (e as Error).message || 'Failed to skip retrospective',
      });
    }
  }, [projectId, state.cycleId]);

  const applySuggestion = useCallback((id: number) => {
    dispatch({ type: 'APPLY_SUGGESTION', id });
  }, []);

  const dismissSuggestion = useCallback((id: number) => {
    dispatch({ type: 'DISMISS_SUGGESTION', id });
  }, []);

  const advanceToEdit = useCallback(() => {
    dispatch({ type: 'ADVANCE_TO_EDIT' });
  }, []);

  const updateCell = useCallback((change: ForecastChange) => {
    dispatch({ type: 'UPDATE_CELL', payload: change });
  }, []);

  const saveEditsAndAdvance = useCallback(async () => {
    if (!state.cycleId) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await workbenchApi.saveEdits(
        projectId,
        state.cycleId,
        state.workingChanges,
        state.appliedSuggestionIds,
      );
      const reviewRes = await workbenchApi.getReview(projectId, state.cycleId);
      dispatch({
        type: 'SET_REVIEW_GROUPS',
        payload: reviewRes.items,
        gridData: (reviewRes as Record<string, unknown>).grid_data as ReviewGridData | undefined,
        ccGroups: (reviewRes as Record<string, unknown>).cost_centre_groups as CostCentreGroup[] | undefined,
      });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: (e as Error).message || 'Failed to save edits',
      });
    }
  }, [projectId, state.cycleId, state.workingChanges, state.appliedSuggestionIds]);

  const setJustification = useCallback((groupType: string, text: string) => {
    dispatch({ type: 'SET_JUSTIFICATION', groupType, text });
  }, []);

  const submitCycle = useCallback(async () => {
    if (!state.cycleId) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // Attach justifications to cost centre groups (v3) or legacy groups
      const ccGroupsWithJustifications = state.costCentreGroups.length > 0
        ? state.costCentreGroups.map((g) => ({
            ...g,
            justification: state.justifications[g.id] || '',
          }))
        : undefined;
      const groupsWithJustifications = state.reviewGroups.map((g) => ({
        ...g,
        justification: state.justifications[g.type] || '',
      }));
      const result = await workbenchApi.submitCycle(
        projectId,
        state.cycleId,
        groupsWithJustifications,
        ccGroupsWithJustifications,
      );
      dispatch({ type: 'SUBMIT_SUCCESS', payload: result.items });
    } catch (e) {
      dispatch({
        type: 'SET_ERROR',
        payload: (e as Error).message || 'Failed to submit forecast cycle',
      });
    }
  }, [projectId, state.cycleId, state.reviewGroups, state.costCentreGroups, state.justifications]);

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    startCycle,
    setExplanation,
    acknowledgeRetrospective,
    skipRetrospective,
    applySuggestion,
    dismissSuggestion,
    advanceToEdit,
    updateCell,
    saveEditsAndAdvance,
    setJustification,
    submitCycle,
    goBack,
    reset,
  };
}
