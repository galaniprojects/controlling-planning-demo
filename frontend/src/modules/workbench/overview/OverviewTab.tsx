import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { workbenchApi } from '@/api/endpoints';
import type { ProjectOverview, TimelineData } from '@/types/api';
import { MetadataBar } from './MetadataBar';
import { ThreePointTable } from './ThreePointTable';
import { CapexOpexDisplay } from './CapexOpexDisplay';
import { ResourceSummaryTable } from './ResourceSummaryTable';
import { ProjectTimelineChart } from './ProjectTimelineChart';
import { ProjectTrajectoryChart } from '@/components/charts/ProjectTrajectoryChart';

interface Props {
  projectId: string;
}

export function OverviewTab({ projectId }: Props) {
  const [data, setData] = useState<ProjectOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      workbenchApi.getOverview(projectId),
      workbenchApi.getTimeline(projectId),
    ])
      .then(([overview, tl]) => {
        setData(overview);
        setTimeline(tl);
      })
      .catch(() => {
        setData(null);
        setTimeline(null);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Failed to load project overview.</p>;
  }

  return (
    <div className="space-y-6">
      <MetadataBar metadata={data.metadata} />

      {/* Project Timeline Visualization */}
      {timeline && timeline.monthly_data.length > 0 && (
        <ProjectTimelineChart data={timeline} />
      )}

      <ThreePointTable data={data.three_point_comparison} />

      <div>
        <h3 className="text-sm font-medium text-slate-500 mb-2">
          Forecast Trajectory
        </h3>
        <ProjectTrajectoryChart data={data.trajectory_chart} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CapexOpexDisplay
          type={data.capex_opex.type}
          capexAmount={data.capex_opex.capex_amount}
          opexAmount={data.capex_opex.opex_amount}
          capexPct={data.capex_opex.capex_pct}
          opexPct={data.capex_opex.opex_pct}
        />
        <ResourceSummaryTable items={data.resource_plan_summary} />
      </div>
    </div>
  );
}
