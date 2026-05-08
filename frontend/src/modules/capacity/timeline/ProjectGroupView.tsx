/**
 * ProjectGroupView — Lead pre-work seam for v5.2 W5 Track B (S9, spec §10).
 *
 * This file is the placeholder Track B will fully populate. It exists so the
 * `CapacityTimeline` switch on `groupBy === 'project'` has a stable mount
 * point that doesn't collide with the role-view tree (Track A's `S6b`
 * timeline-overlay work).
 *
 * Track B's task:
 *   1. Replace `ProjectGroupViewPlaceholder` with the §10 component tree
 *      (`ProjectGroup` + `ProjectGroupRow` + `AssignedPersonRow` +
 *      `UnassignedSlotRow` + `ExternalCostRow` + `UnassignedSummary`).
 *   2. Keep the public surface (`<ProjectGroupView columns={...} />`)
 *      stable — `CapacityTimeline.tsx` mounts it; nothing else should
 *      need to change there.
 *   3. The component is rendered *inside* `<ProjectColorMapProvider>` (its
 *      parent already provides the color map), so child rows can call
 *      `useProjectColor()` to share fills with the role-view segments.
 *
 * Data feed: `capacityApi.getProjects({ scope, start, end, filter_chip })`
 * (defined in `frontend/src/api/endpoints.ts`). The response is typed as
 * `CapacityProjectsResponse` in `frontend/src/types/api.ts`.
 *
 * The placeholder calls the endpoint to verify wiring end-to-end and so
 * Track B inherits a proven fetch path instead of building one fresh.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { capacityApi } from '@/api/endpoints';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import type { TimeColumn } from './timeAxis';
import type {
  CapacityProjectItem,
  CapacityProjectsResponse,
} from '@/types/api';

interface ProjectGroupViewProps {
  /** Visible time columns from `buildVisibleColumns(...)`. Same shape the
   *  role view consumes — Track B uses these to align the bar grid. */
  columns: TimeColumn[];
}

export function ProjectGroupView({ columns }: ProjectGroupViewProps) {
  const { scope, ccId } = useCapacityScope();
  const [data, setData] = useState<CapacityProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resolve the API scope param the same way the dashboard / inbox do.
  const scopeParam = scopeToApiParam(scope, ccId);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    capacityApi
      .getProjects({ scope: scopeParam })
      .then((res) => {
        if (cancelled) return;
        setData(res);
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
  }, [scopeParam]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load project view: {error}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No projects in this scope.
        </CardContent>
      </Card>
    );
  }

  return (
    <ProjectGroupViewPlaceholder items={data.items} columns={columns} />
  );
}

/**
 * Track B replaces this placeholder with the §10 component tree. The
 * placeholder lists projects with their fulfillment percentage so visual
 * verification confirms the data feed lights up across the full pipeline.
 */
function ProjectGroupViewPlaceholder({
  items,
  columns: _columns,
}: {
  items: CapacityProjectItem[];
  columns: TimeColumn[];
}) {
  return (
    <div role="rowgroup" className="divide-y divide-border">
      {items.map((it) => (
        <div
          key={it.project_id}
          className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              {it.project_name}
            </span>
            <span className="text-muted-foreground">
              {it.hierarchy_node_name ?? '—'}
              {it.pl_name ? ` · ${it.pl_name}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 tabular-nums text-muted-foreground">
            <span>
              {it.fully_assigned_request_count}/{it.total_request_count}
            </span>
            <span className="rounded-sm border border-border px-1.5 py-0.5">
              {it.fulfillment_pct.toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ProjectGroupView;
