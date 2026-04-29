/**
 * usePipelineState — fetches GET /api/projects/{id}/pipeline.
 *
 * Used by the workbench header, backlog detail header, and the
 * pipeline-transition menu to render stage badges, DoI badges, and the gate
 * checklist. Refetch by calling the returned ``refresh`` function (e.g. after
 * a successful stage transition).
 */

import { useCallback, useEffect, useState } from 'react';
import { pipelineApi } from '@/api/endpoints';
import type { PipelineState } from '@/types/pipeline';

interface State {
  data: PipelineState | null;
  loading: boolean;
  error: string | null;
}

export function usePipelineState(projectId: string | null | undefined) {
  const [state, setState] = useState<State>({
    data: null,
    loading: !!projectId,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!projectId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await pipelineApi.get(projectId);
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load pipeline state',
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
