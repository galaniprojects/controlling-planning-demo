/**
 * Project-scope Session 3 — T2 surface-local hook for external-cost line items.
 *
 * Owns the external-cost list fetch (keyed scenarioId + projectId + a reload
 * tick) and the add/edit/remove handshake against the frozen overlay endpoints
 * via the ScenarioContext T2 mutations. Each write adopts the response's
 * refreshed `external_costs` list directly (one round-trip) and, for changes
 * that reshape the grid (add/remove/relabel), calls `onStructureChange` so the
 * parent ForecastGridSurface refetches the grid.
 *
 * The ScenarioContext mutations already mark the scenario stale + append the
 * change-feed entry (mirroring `applyCellOverlay`); this hook only manages the
 * surface-local list + busy/error lifecycle.
 */
import { useCallback, useEffect, useState } from 'react';
import { useScenarioContext } from '../../useScenarioContext';
import type {
  ExternalCostLineCreateBody,
  ExternalCostLineItem,
  ExternalCostLineUpdateBody,
  ExternalCostListResponse,
  ExternalCostTypeOption,
} from '../../api/scenariosApi';

export interface UseExternalCostEdits {
  items: ExternalCostLineItem[];
  costTypes: ExternalCostTypeOption[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  reload: () => void;
  add: (body: ExternalCostLineCreateBody) => Promise<boolean>;
  edit: (lineKey: string, body: ExternalCostLineUpdateBody) => Promise<boolean>;
  remove: (lineKey: string) => Promise<boolean>;
}

export function useExternalCostEdits(
  projectId: string,
  /** Called after a write that changes the grid (add/remove/relabel) so the
   * parent can refetch the forecast grid. */
  onStructureChange?: () => void,
): UseExternalCostEdits {
  const {
    scenarioId,
    listExternalCosts,
    addExternalCost,
    editExternalCost,
    removeExternalCost,
  } = useScenarioContext();

  const [list, setList] = useState<ExternalCostListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listExternalCosts(projectId)
      .then((res) => {
        if (!cancelled) setList(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load external costs');
        setList(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId, projectId, tick, listExternalCosts]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const clearError = useCallback(() => setError(null), []);

  const run = useCallback(
    async (op: () => Promise<ExternalCostListResponse>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const next = await op();
        setList(next);
        onStructureChange?.();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'External-cost edit failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onStructureChange],
  );

  const add = useCallback(
    (body: ExternalCostLineCreateBody) =>
      run(async () => (await addExternalCost(projectId, body)).external_costs),
    [run, addExternalCost, projectId],
  );

  const edit = useCallback(
    (lineKey: string, body: ExternalCostLineUpdateBody) =>
      run(async () =>
        (await editExternalCost(projectId, lineKey, body)).external_costs,
      ),
    [run, editExternalCost, projectId],
  );

  const remove = useCallback(
    (lineKey: string) =>
      run(async () =>
        (await removeExternalCost(projectId, lineKey)).external_costs,
      ),
    [run, removeExternalCost, projectId],
  );

  return {
    items: list?.items ?? [],
    costTypes: list?.available_cost_types ?? [],
    loading,
    busy,
    error,
    clearError,
    reload,
    add,
    edit,
    remove,
  };
}
