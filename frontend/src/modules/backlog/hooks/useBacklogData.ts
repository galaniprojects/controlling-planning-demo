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
    backlogApi
      .getBacklog({
        pipeline_stage: p.pipeline_stage || undefined,
        project_type: p.project_type || undefined,
        tshirt_size: p.tshirt_size || undefined,
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
  }, [params.pipeline_stage, params.project_type, params.tshirt_size, doFetch]);

  return { data, loading, error, refetch };
}
