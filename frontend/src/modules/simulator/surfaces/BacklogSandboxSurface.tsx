/**
 * v5 B2 — BacklogSandboxSurface mounts the live backlog ranked-list view
 * inside the simulator workspace, wrapped with `SandboxBacklogProvider`
 * so filter/sort state lives in memory (no URL pollution) and the
 * scenario version is exposed to data hooks.
 *
 * Per the plan: the surface displays the *live* backlog with sandbox
 * scores layered on top. When backend Lever 6 (Tech Navigator score
 * forks) and Lever 7 (Total available budget) are wired into the
 * backlog API, the sandboxed backlog will reflect the scenario's
 * adjusted ranking. Until then this surface still demonstrates the
 * mounting pattern correctly.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  SandboxBacklogProvider,
  useBacklog,
  type BacklogFilters,
  type SortField,
} from '@/modules/backlog/BacklogContext';
import { useBacklogData } from '@/modules/backlog/hooks/useBacklogData';
import { RankedListView } from '@/modules/backlog/components/ranked/RankedListView';
import { CutoffSummaryStrip } from '@/modules/backlog/components/CutoffSummaryStrip';
import { BacklogFilterBar } from '@/modules/backlog/components/BacklogFilterBar';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

function BacklogInner() {
  const {
    filters,
    setFilter,
    clearFilters,
    sortField,
    sortDir,
    hasSortOverride,
    setSort,
    clearSort,
  } = useBacklog();

  const { data, loading, error } = useBacklogData({
    pipeline_stage: filters.pipeline_stage,
    project_type: filters.project_type,
    tshirt_size: filters.tshirt_size,
  });

  // The filter bar wires straight into the sandbox provider's in-memory filter
  // state (pipeline-stage / project-type / t-shirt-size feed the server-side
  // backlog query; T-level / within-cutoff are applied client-side), so it must
  // render above the loading/error states rather than disappearing while the
  // re-filtered ranking re-fetches.
  const body = error ? (
    <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
      <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
    </Card>
  ) : loading || !data ? (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  ) : (
    <div className="space-y-4">
      <CutoffSummaryStrip
        cutoff={data.cutoff}
        config={data.config}
        onJumpShouldBe={() => {}}
        onJumpReality={() => {}}
      />
      <RankedListView
        data={data}
        filters={filters as BacklogFilters}
        sortField={sortField as SortField | null}
        sortDir={sortDir}
        hasSortOverride={hasSortOverride}
        onSort={setSort}
        onClearSort={clearSort}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <BacklogFilterBar
        filters={filters as BacklogFilters}
        onFilterChange={setFilter}
        onClear={clearFilters}
      />
      {body}
    </div>
  );
}

export function BacklogSandboxSurface() {
  const { scenarioVersion } = useScenarioContext();
  // useState here is unused but prevents the surface from re-mounting and
  // re-creating the SandboxBacklogProvider on every parent re-render.
  const [, _set] = useState(0);
  void _set;
  return (
    <SurfaceCard
      title="Backlog (sandbox view)"
      subtitle={`Ranking reflects the live engine. Sandbox scenario: ${scenarioVersion}.`}
    >
      <SandboxBacklogProvider scenarioVersion={scenarioVersion}>
        <BacklogInner />
      </SandboxBacklogProvider>
    </SurfaceCard>
  );
}
