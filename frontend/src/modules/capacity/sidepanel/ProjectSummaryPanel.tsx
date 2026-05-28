/**
 * ProjectSummaryPanel — v5.2 W5 Track B (spec §10.8).
 *
 * Side-panel content shown when the user clicks a project group row in
 * the workspace timeline. Width 280px (per `CAPACITY_PANEL_WIDTH.project_summary`).
 *
 * Sections rendered top → bottom (per §10.8):
 *   1. Header — project name + meta (hierarchy node, PL, status, period).
 *   2. Role-by-role assignment progress — one line per resource RR with
 *      its staffing status (e.g. "Sr Developer: 7/7 months ✓",
 *      "QA Engineer: 0/5 months — unassigned").
 *   3. Total allocated hours for the project across the visible window.
 *   4. "Review & assign" button → enters assignment mode for this project.
 *   5. "View in workbench" link → /workbench?entity={id} via
 *      navigateToWorkbenchByProject (Wave C — falls back to ?project=
 *      on resolver failure, picked up by the alias resolver).
 *
 * Data feed: `CapacityProjectItem` from `getProjects` — the parent
 * (`CapacityWorkspace`) caches the response in a shared map and the
 * side-panel handler reads from there.
 *
 * v5.2 W6 Track A — cache-miss fallback (spec §10.8 deep-link case).
 * If the workspace cache doesn't have the requested projectId (e.g.,
 * the side panel is opened from a deep link or the workspace scope
 * changed since the cache was built), the panel issues a fallback
 * fetch via `capacityApi.getProjects({scope:'all'})` and finds the
 * matching project. Loading skeleton + error empty-state are rendered
 * in lieu of the populated content while the fetch is in flight or if
 * the project is not found.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight, AlertTriangle } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { capacityApi } from '@/api/endpoints';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';
import { cn } from '@/lib/utils';
import { navigateToWorkbenchByProject } from '@/lib/workbenchNavigation';
import type { CapacityProjectItem } from '@/types/api';

export interface ProjectSummaryPanelProps {
  /**
   * Pre-resolved project payload from the workspace cache. When
   * undefined, the panel fetches via the cache-miss fallback path
   * (W6 Track A — deep-link case per spec §10.8).
   */
  item?: CapacityProjectItem;
  /**
   * Project id used by the cache-miss fallback to fetch the missing
   * record. Required so the panel can render a loader + error empty
   * state without coupling to the workspace's cache implementation.
   */
  projectId: string;
  /**
   * Handler invoked when the user clicks "Review & assign".  The parent
   * (CapacityWorkspace) wires this to `enterAssignmentMode` +
   * `openAssignment` from inside the `CapacitySidePanelProvider` tree
   * — the panel itself can't call `useCapacitySidePanel` because it
   * renders OUTSIDE that provider (the shared `<SidePanel>` lives in
   * `AppLayout`, above the workspace tree).
   */
  onReviewAssign: (item: CapacityProjectItem) => void;
  /**
   * Handler invoked when the user clicks "View in workbench" — closes
   * the side panel.  Same provider-boundary reason as `onReviewAssign`.
   */
  onClosePanel: () => void;
  /**
   * Navigate function injected from the workspace tree (where
   * react-router context is available). Typed as the full
   * `NavigateFunction` so the panel can pass it through to the
   * Wave-C workbenchNavigation helper (which expects the rich
   * react-router type, not the legacy `(path: string) => void` form).
   */
  navigate: NavigateFunction;
}

/**
 * Compute the per-RR progress line: "Sr Developer: 7/7 months ✓" etc.
 *
 * Resource requests come from two sources in the API payload:
 *   - `unfulfilled_slots` — RRs with status pending / partially_fulfilled.
 *   - For fully-assigned RRs we infer them from the difference between
 *     `total_request_count` and the unfulfilled-slots length, but we
 *     can't list them individually without the role names. To keep the
 *     panel honest, we list the unfulfilled ones explicitly and show a
 *     summary line for the fully-assigned remainder.
 */
function buildProgressLines(item: CapacityProjectItem): {
  unfulfilled: { id: number; role: string; assigned: number; requested: number }[];
  fullyAssignedCount: number;
} {
  const unfulfilled = item.unfulfilled_slots.map((slot) => {
    let assigned = 0;
    let requested = 0;
    for (const m of slot.monthly) {
      assigned += m.assigned_hours;
      requested += m.requested_hours;
    }
    return {
      id: slot.request_id,
      role: slot.role_name ?? 'Unspecified role',
      assigned,
      requested,
    };
  });
  return {
    unfulfilled,
    fullyAssignedCount: item.fully_assigned_request_count,
  };
}

function totalAllocatedHours(item: CapacityProjectItem): number {
  let total = 0;
  for (const person of item.assigned_people) {
    for (const m of person.monthly) {
      total += m.this_project_hours;
    }
  }
  return total;
}

function StaffingPill({
  assigned,
  requested,
}: {
  assigned: number;
  requested: number;
}) {
  const isFull = requested > 0 && assigned >= requested - 1e-3;
  const isZero = assigned <= 1e-3;
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        isFull
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : isZero
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      )}
    >
      {assigned.toFixed(0)}h / {requested.toFixed(0)}h
    </span>
  );
}

/**
 * Public wrapper. When `item` is provided, the rendered content is the
 * fully-populated summary. When `item` is undefined, the panel issues a
 * cache-miss fallback fetch (`capacityApi.getProjects({scope:'all'})`)
 * and resolves it client-side by matching `projectId`. The capacity
 * project endpoint returns the same `CapacityProjectItem` shape so no
 * payload adaptation is required.
 *
 * The `getProjects` payload is keyed by the active scope's reference
 * window; calling it with `scope='all'` and no explicit start/end gives
 * us the same default window the workspace uses, which is the right
 * answer for a deep-link entry (no other scope context available).
 */
export function ProjectSummaryPanel({
  item,
  projectId,
  onReviewAssign,
  onClosePanel,
  navigate,
}: ProjectSummaryPanelProps) {
  const [fallbackItem, setFallbackItem] = useState<CapacityProjectItem | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fire the fallback fetch only when the workspace cache misses. When
  // `item` is supplied (the warm-cache path), we skip the network call
  // entirely.
  useEffect(() => {
    if (item) {
      // Reset any stale fallback state in case the same panel instance
      // transitions from cache-miss to cache-hit (e.g., projectData
      // resolves after the panel opens).
      setFallbackItem(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    capacityApi
      .getProjects({ scope: 'all' })
      .then((resp) => {
        if (cancelled) return;
        const found = resp.items.find((it) => it.project_id === projectId);
        if (!found) {
          setError('Project not found in current scope.');
          setFallbackItem(null);
        } else {
          setFallbackItem(found);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load project summary',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, projectId]);

  const resolved = item ?? fallbackItem;

  if (!resolved) {
    if (loading) {
      return (
        <div className="flex flex-col gap-4 p-4 text-sm">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center text-sm">
        <AlertTriangle
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="font-medium text-foreground">Project unavailable</p>
        <p className="text-xs text-muted-foreground">
          {error ??
            'This project is not visible with your current scope. ' +
              'Adjust the scope or open it from the workspace timeline.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={onClosePanel}
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <ProjectSummaryPanelContent
      item={resolved}
      onReviewAssign={onReviewAssign}
      onClosePanel={onClosePanel}
      navigate={navigate}
    />
  );
}

// ---------------------------------------------------------------------------
// Content (resolved-item path)
// ---------------------------------------------------------------------------

function ProjectSummaryPanelContent({
  item,
  onReviewAssign,
  onClosePanel,
  navigate,
}: {
  item: CapacityProjectItem;
  onReviewAssign: (item: CapacityProjectItem) => void;
  onClosePanel: () => void;
  navigate: NavigateFunction;
}) {
  const projectColor = useProjectColor(item.project_id);
  const { unfulfilled, fullyAssignedCount } = buildProgressLines(item);
  const allocatedHours = totalAllocatedHours(item);

  const handleReviewAssign = () => onReviewAssign(item);

  const handleViewInWorkbench = () => {
    // Service Workbench Wave C: resolve project → entity and navigate
    // via the canonical `?entity=` form. Falls back to `?project=`
    // (which the alias resolver picks up) if resolution fails.
    navigateToWorkbenchByProject(item.project_id, navigate);
    onClosePanel();
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm animate-in fade-in-0 duration-200">

      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <span
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: projectColor }}
            aria-hidden="true"
          />
          <h3 className="text-base font-medium leading-snug text-foreground">
            {item.project_name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
          {item.hierarchy_node_name && (
            <span className="rounded-sm bg-secondary/60 px-1.5 py-0 font-medium uppercase tracking-wide text-secondary-foreground">
              {item.hierarchy_node_name}
            </span>
          )}
          {item.pl_name && <span>PL: {item.pl_name}</span>}
          {item.project_status && (
            <span className="capitalize">· {item.project_status}</span>
          )}
        </div>
      </div>

      {/* Fulfillment KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Fulfillment
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {item.fulfillment_pct.toFixed(0)}%
          </div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Requests
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {fullyAssignedCount}/{item.total_request_count}
          </div>
        </div>
      </div>

      {/* Role-by-role assignment progress */}
      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Assignment progress
        </div>
        <div className="flex flex-col gap-1.5">
          {fullyAssignedCount > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-sm bg-green-50 px-2 py-1 text-xs dark:bg-green-900/20">
              <span className="text-foreground">
                {fullyAssignedCount} fully-assigned request{fullyAssignedCount === 1 ? '' : 's'}
              </span>
              <span className="text-[10px] text-green-700 dark:text-green-400">
                ✓
              </span>
            </div>
          )}
          {unfulfilled.length === 0 && fullyAssignedCount === 0 && (
            <div className="rounded-sm bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
              No resource requests for this project.
            </div>
          )}
          {unfulfilled.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">
                {line.role}
              </span>
              <StaffingPill assigned={line.assigned} requested={line.requested} />
            </div>
          ))}
        </div>
      </div>

      {/* Total allocated hours */}
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">Total allocated (window)</span>
        <span className="font-medium tabular-nums text-foreground">
          {allocatedHours.toFixed(0)}h
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={handleReviewAssign}
        >
          Review &amp; assign
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleViewInWorkbench}
        >
          View in workbench
          <ArrowUpRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
