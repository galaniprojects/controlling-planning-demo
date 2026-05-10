/**
 * useCapacityProjectsData — v5.2 W5 Track B (spec §10).
 *
 * Single fetch of `GET /api/capacity/projects` returning the unfiltered
 * project list for the current scope. Filter-chip predicates are applied
 * client-side via `projectFilters.ts` so:
 *
 *   - The `FilterChipBar` chip badges and the rendered project list
 *     always reflect the same data set.
 *   - We avoid N round-trips for chip-count overlays.
 *
 * The hook is `enabled`-gated so it only fetches when group-by-project
 * is active — outside the project view the role/person hooks remain
 * the active data sources.
 *
 * v5.2 closeout — added module-level inflight dedup mirroring the
 * `useDashboardForecastData` pattern (W6 P2.B). When `CapacityTimeline`
 * and `ProjectGroupView` both consume the hook with the same scope,
 * they share a single in-flight promise instead of firing parallel
 * fetches. Cleared in `.finally()` so the map doesn't grow unbounded
 * and doesn't survive page reloads.
 */
import { useEffect, useMemo, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import {
  useCapacityScope,
  type CapacityScope,
} from '@/contexts/CapacityScopeContext';
import type {
  CapacityProjectItem,
  CapacityProjectsResponse,
} from '@/types/api';

// Module-level inflight map: scope-key → in-flight promise.
// Cleared in `.finally()` so the entry doesn't outlive the request.
const inflight = new Map<string, Promise<CapacityProjectsResponse>>();

function fetchProjectsDeduped(
  scopeParam: string,
): Promise<CapacityProjectsResponse> {
  const existing = inflight.get(scopeParam);
  if (existing) return existing;
  const p = capacityApi.getProjects({ scope: scopeParam }).finally(() => {
    inflight.delete(scopeParam);
  });
  inflight.set(scopeParam, p);
  return p;
}

export interface CapacityProjectsState {
  /** Unfiltered project list (post-fetch, pre-chip-filter). */
  items: readonly CapacityProjectItem[];
  /** Highest single-month requested hours across visible projects. */
  referenceMaxHours: number;
  /** Total count of items returned by the API. */
  total: number;
  isLoading: boolean;
  error: string | null;
  /** Active scope used for the fetch — handy for diagnostics. */
  scope: CapacityScope;
}

const EMPTY_STATE: Omit<CapacityProjectsState, 'scope'> = {
  items: [],
  referenceMaxHours: 0,
  total: 0,
  isLoading: false,
  error: null,
};

/**
 * Returns the project-view aggregation for the workspace timeline.
 *
 * @param enabled when false, no fetch is issued and the state collapses to
 *   the empty defaults. Pass `groupBy === 'project'` from the caller so
 *   the hook only does work when the project view is mounted.
 */
export function useCapacityProjectsData(enabled: boolean): CapacityProjectsState {
  const { scope, ccId } = useCapacityScope();
  const scopeParam = scopeToApiParam(scope, ccId);
  const [response, setResponse] = useState<CapacityProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);

  useEffect(() => {
    if (!enabled) {
      setResponse(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchProjectsDeduped(scopeParam)
      .then((res) => {
        if (cancelled) return;
        setResponse(res);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, scopeParam]);

  return useMemo<CapacityProjectsState>(() => {
    if (!enabled) {
      return { ...EMPTY_STATE, scope };
    }
    if (response) {
      return {
        items: response.items,
        referenceMaxHours: response.reference_max_hours,
        total: response.total,
        isLoading,
        error,
        scope,
      };
    }
    return {
      ...EMPTY_STATE,
      isLoading,
      error,
      scope,
    };
  }, [enabled, response, isLoading, error, scope]);
}
