/**
 * useDashboardForecastData — v5.2 W6 Track C (refactor #2).
 *
 * Single hook around `GET /api/capacity/dashboard/forecast` shared by
 * `CapacityForecastCard` (chart) and `KPISummaryBar` (avg-utilization
 * KPI). Both components used to issue the fetch independently with the
 * same scope key — extracting the call into a hook removes ~25 LOC of
 * boilerplate (loading / error / cancel guards) and keeps the
 * loading-state shape consistent with the workspace's other shared
 * hooks (`useScopedTimelineData`, `useCapacityProjectsData`).
 *
 * v5.2 W6 review-pass-2 fix (P2.B) — added a module-level inflight
 * `Map<apiScope, Promise>` so when both `KPISummaryBar` and
 * `CapacityForecastCard` mount together they share a single in-flight
 * request instead of firing two parallel fetches. The map only holds
 * promises while they're inflight (cleared in finally), so it doesn't
 * grow unbounded and doesn't survive page reloads. Mirrors the W6 #8.2
 * pattern shipped in `PersonPicker`.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.4.
 */
import { useEffect, useMemo, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import type {
  DashboardForecastPoint,
  DashboardForecastResponse,
} from '@/types/api';

// Module-level inflight map: scope-key → in-flight promise.
// Cleared in `.finally()` so the entry doesn't outlive the request.
const inflight = new Map<string, Promise<DashboardForecastResponse>>();

function fetchForecastDeduped(
  apiScope: string,
): Promise<DashboardForecastResponse> {
  const existing = inflight.get(apiScope);
  if (existing) return existing;
  const p = capacityApi.getDashboardForecast(apiScope).finally(() => {
    inflight.delete(apiScope);
  });
  inflight.set(apiScope, p);
  return p;
}

export interface DashboardForecastData {
  /** Month-by-month forecast points; `[]` until the first fetch resolves. */
  items: DashboardForecastPoint[];
  /** Window start (`YYYY-MM`) reported by the API; `null` until loaded. */
  start: string | null;
  /** Window end (`YYYY-MM`) reported by the API; `null` until loaded. */
  end: string | null;
  isLoading: boolean;
  /** Error message if the fetch failed; `null` otherwise. */
  error: string | null;
}

const EMPTY: DashboardForecastData = {
  items: [],
  start: null,
  end: null,
  isLoading: true,
  error: null,
};

export function useDashboardForecastData(): DashboardForecastData {
  const { scope, ccId } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);

  const [response, setResponse] = useState<DashboardForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchForecastDeduped(apiScope)
      .then((res) => {
        if (cancelled) return;
        setResponse(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load forecast');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiScope]);

  return useMemo<DashboardForecastData>(() => {
    if (!response) {
      return { ...EMPTY, isLoading, error };
    }
    return {
      items: response.items ?? [],
      start: response.start ?? null,
      end: response.end ?? null,
      isLoading,
      error,
    };
  }, [response, isLoading, error]);
}
