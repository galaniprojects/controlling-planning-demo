/**
 * useBacklogData — debounced fetch of /api/portfolio/backlog.
 * Re-fetches when server-side filter params change. [A-BK-22]
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { backlogApi } from '@/api/endpoints';
import type { RankedBacklogResponse } from '@/types/api';

const DEBOUNCE_MS = 300;

interface Params {
  pipeline_stage: string;
  project_type: string;
  tshirt_size: string;
  /** Fiscal year scope (e.g. "2026"); "all" / "" / undefined = no scoping. */
  start_year?: string;
}

export function useBacklogData(params: Params) {
  const [data, setData] = useState<RankedBacklogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const doFetch = useCallback((p: Params) => {
    setLoading(true);
    setError(null);
    // Only forward a numeric fiscal year; "all"/"" leave the pool unscoped.
    const yearNum = Number(p.start_year);
    backlogApi
      .getBacklog({
        pipeline_stage: p.pipeline_stage || undefined,
        project_type: p.project_type || undefined,
        tshirt_size: p.tshirt_size || undefined,
        start_year: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      })
      .then((d) => {
        setData(d);
      })
      .catch((e: Error) => {
        setError(e.message ?? 'Failed to load backlog');
      })
      .finally(() => setLoading(false));
  }, []);

  const refetch = useCallback(() => {
    doFetch(paramsRef.current);
  }, [doFetch]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doFetch(params), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.pipeline_stage,
    params.project_type,
    params.tshirt_size,
    params.start_year,
    doFetch,
  ]);

  return { data, loading, error, refetch };
}
