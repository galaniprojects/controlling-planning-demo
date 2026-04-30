/**
 * Workbench Overview tab — 3×3 tile grid per `[E-04a]` `[E-04b]`.
 *
 * Replaces the v4 vertical scroll of full-width components (MetadataBar,
 * ProjectTimelineChart, MonthlyTimelineTable, ThreePointTable,
 * ProjectTrajectoryChart, two-column CapEx/Resource, BTC tile) with a
 * 3×3 grid of action cards. The F6 BTC allocation tile is preserved
 * separately and rendered below the grid per the E3 + E-09 coexistence
 * note.
 *
 * Two tile clicks open expanded dialogs per Cluster E spec:
 *  - Three-Point Summary tile → variance waterfall dialog (`[E-05c]`)
 *  - Progress Tracker tile    → progress vs. burn dialog   (`[E-05a]`)
 */
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { workbenchApi } from '@/api/endpoints';
import type { ProjectOverview } from '@/types/api';
import {
  ProjectHeaderTile,
  ThreePointSummaryTile,
  MilestoneStatusTile,
  ResourcePlanTile,
  CostMixTile,
  ProgressTrackerTile,
  ExternalCostsTile,
  ForecastHealthTile,
  TechNavigatorTile,
} from './tiles';
import { BTCAllocationTile } from './BTCAllocationTile';
import { ProgressVsBurnDialog } from './expanded/ProgressVsBurnDialog';
import { VarianceWaterfallDialog } from './expanded/VarianceWaterfallDialog';

interface Props {
  projectId: string;
  /**
   * Triggered by BTC tile CTA buttons. Parent (ProjectWorkspace) flips
   * the active tab so the user lands directly in the BTC editor.
   */
  onOpenBTCTab?: () => void;
  /**
   * Triggered by tiles whose click target is the Forecast & Planning
   * tab (Three-Point Summary expanded view, Resource Plan, Cost Mix
   * fallback, Forecast Health version history). Parent switches the
   * active tab.
   */
  onOpenForecastTab?: () => void;
  /**
   * Triggered when a waterfall bar is clicked — the parent should switch
   * to the Change History tab (and optionally apply the category filter
   * if it supports deep-linking; today's tab does not but the affordance
   * is part of the Cluster E navigation surface).
   */
  onOpenChangeHistory?: (category?: string) => void;
}

export function OverviewTab({
  projectId,
  onOpenBTCTab,
  onOpenForecastTab,
  onOpenChangeHistory,
}: Props) {
  const [data, setData] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [waterfallDialogOpen, setWaterfallDialogOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    workbenchApi
      .getOverview(projectId)
      .then((overview) => setData(overview))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Failed to load project overview.
      </p>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* 3×3 tile grid per [E-04a] */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Row 1 */}
        <ProjectHeaderTile metadata={data.metadata} projectId={projectId} />
        <ThreePointSummaryTile
          data={data.three_point_comparison}
          onClick={() => setWaterfallDialogOpen(true)}
        />
        <MilestoneStatusTile
          projectId={projectId}
          onClick={onOpenForecastTab}
        />

        {/* Row 2 */}
        <ResourcePlanTile
          title={data.resource_plan_title}
          items={data.resource_plan_summary}
          onClick={onOpenForecastTab}
        />
        <CostMixTile
          projectId={projectId}
          capexOpex={data.capex_opex}
          onClick={onOpenForecastTab}
        />
        <ProgressTrackerTile
          projectId={projectId}
          onClick={() => setProgressDialogOpen(true)}
        />

        {/* Row 3 */}
        <ExternalCostsTile
          projectId={projectId}
          onClick={onOpenForecastTab}
        />
        <ForecastHealthTile
          projectId={projectId}
          onClick={onOpenForecastTab}
        />
        <TechNavigatorTile projectId={projectId} />
      </div>

      {/* BTC allocation tile per [E-09] (F6) — preserved separately as a
          full-width band below the 3×3 grid per the E3 + E-09 coexistence
          note. */}
      <BTCAllocationTile
        projectId={projectId}
        onOpenBTCTab={() => onOpenBTCTab?.()}
      />

      {/* Expanded dialogs */}
      <ProgressVsBurnDialog
        projectId={projectId}
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
      />
      <VarianceWaterfallDialog
        projectId={projectId}
        open={waterfallDialogOpen}
        onOpenChange={setWaterfallDialogOpen}
        onNavigateToChangeHistory={(cat) => onOpenChangeHistory?.(cat)}
      />
    </div>
  );
}
