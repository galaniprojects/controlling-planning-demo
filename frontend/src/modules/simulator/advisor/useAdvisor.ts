/**
 * v5 B2 — Advisor hook (kept separate from ScenarioContext per plan).
 *
 * Provides the v4 advisor query / apply surface scoped to the current
 * scenario. Mounted only when `ADVISOR_ENABLED` is true.
 */

import { useCallback, useState } from 'react';
import { scenariosApi } from '../api/scenariosApi';
import { useScenarioContext } from '../useScenarioContext';
import type { AdvisorQueryResponse } from '@/types/api';

export function useAdvisor() {
  const ctx = useScenarioContext();
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorNarrative, setAdvisorNarrative] = useState<string | null>(null);

  const advisorQuery = useCallback(
    async (goal: string): Promise<AdvisorQueryResponse | null> => {
      setAdvisorLoading(true);
      setAdvisorNarrative(null);
      try {
        return await scenariosApi.advisorQuery(ctx.scenarioId, goal);
      } catch {
        return null;
      } finally {
        setAdvisorLoading(false);
      }
    },
    [ctx.scenarioId],
  );

  const advisorApply = useCallback(
    async (pathId: string) => {
      setAdvisorLoading(true);
      try {
        const result = await scenariosApi.advisorApply(ctx.scenarioId, pathId);
        setAdvisorNarrative(result.narrative_summary ?? null);
        await ctx.reload();
      } finally {
        setAdvisorLoading(false);
      }
    },
    [ctx],
  );

  return {
    advisorLoading,
    advisorNarrative,
    advisorQuery,
    advisorApply,
  };
}
