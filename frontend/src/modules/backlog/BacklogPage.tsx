/**
 * BacklogPage — /backlog route shell.
 * Ranked backlog with filters, sort, dual views (ranked list + cube). [A-BK-01..26]
 */

import { BacklogProvider, useBacklog } from './BacklogContext';
import { useBacklogData } from './hooks/useBacklogData';
import { BacklogViewToggle } from './components/BacklogViewToggle';
import { BacklogFilterBar } from './components/BacklogFilterBar';
import { CutoffSummaryStrip } from './components/CutoffSummaryStrip';
import { RankedListView } from './components/ranked/RankedListView';
import { CubeView } from './components/cube/CubeView';
import { Skeleton } from '@/components/shared/Skeleton';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';

function BacklogPageInner() {
  const {
    viewMode,
    filters,
    sortField,
    sortDir,
    hasSortOverride,
    setViewMode,
    setFilter,
    clearFilters,
    setSort,
    clearSort,
  } = useBacklog();

  const { data, loading, error } = useBacklogData({
    pipeline_stage: filters.pipeline_stage,
    project_type: filters.project_type,
    tshirt_size: filters.tshirt_size,
  });

  function scrollToShouldBe() {
    document.getElementById('cutoff-band-should-be')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
  function scrollToReality() {
    document.getElementById('cutoff-band-reality')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Backlog
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ranked IT project backlog with composite scoring and cutoff analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ModuleGuideButton moduleId="backlog" />
          <BacklogViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Filters */}
      <BacklogFilterBar
        filters={filters}
        onFilterChange={setFilter}
        onClear={clearFilters}
      />

      {/* Error */}
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Loading */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : data ? (
        <>
          {/* Cutoff KPI strip */}
          <CutoffSummaryStrip
            cutoff={data.cutoff}
            config={data.config}
            onJumpShouldBe={scrollToShouldBe}
            onJumpReality={scrollToReality}
          />

          {/* Views */}
          {viewMode === 'ranked' ? (
            <RankedListView
              data={data}
              filters={filters}
              sortField={sortField}
              sortDir={sortDir}
              hasSortOverride={hasSortOverride}
              onSort={setSort}
              onClearSort={clearSort}
            />
          ) : (
            <CubeView
              items={data.items}
              preFunded={data.pre_funded}
              filters={filters}
              sortField={sortField}
              sortDir={sortDir}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

export function BacklogPage() {
  return (
    <BacklogProvider>
      <BacklogPageInner />
    </BacklogProvider>
  );
}
