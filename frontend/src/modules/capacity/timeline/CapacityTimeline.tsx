/**
 * CapacityTimeline — v5.2 W3 Track A entry point.
 *
 * Composes the four visual pieces (TimeAxisHeader + RoleGroup /
 * FlatPersonRow + horizontally-scrolling viewport) and the data
 * pipeline (`useScopedTimelineData`). The component:
 *
 *   1. Wraps its tree in `<ProjectColorMapProvider>` so segments and
 *      side-panel chips share a stable color → project map (§3.2).
 *   2. Owns the `TimeAxisState` (collapse state per year/quarter) and
 *      derives the `TimeColumn[]` once per render via
 *      `buildVisibleColumns(state, months)`.
 *   3. Registers the visible project ids with the color map whenever
 *      the data resolves so newly-introduced projects keep stable
 *      colors going forward.
 *
 * Lead integrates this into `CapacityWorkspace.tsx` (out of Track A's
 * scope per the team-lead handoff) — Track A only ships the component
 * and its public surface here. The default export (`CapacityTimeline`)
 * is what the workspace mounts.
 *
 * v5.2 W5 Track A (S6b, §9.4 + §9.6): when an assignment session is
 * active (read via `useAssignmentOverlay`), the timeline overlays
 * dashed ghost segments on candidate person rows and dispatches
 * gesture clicks to `setMonthAssignment` / `clearMonthAssignment`.
 * Also registers the active project's id in the color map so the
 * ghost border color is stable across the panel and the bars.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { useProjectColorMap } from '@/contexts/ProjectColorMapContext';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import {
  useScopedTimelineData,
  type ScopedTimelineData,
} from '../hooks/useScopedTimelineData';
import { useAssignmentState } from '../assignment/AssignmentStateContext';
import { TimeAxisHeader } from './TimeAxisHeader';
import { RoleGroup } from './RoleGroup';
import { FlatPersonRow } from './FlatPersonRow';
import { ProjectGroupView } from './ProjectGroupView';
import { useAssignmentOverlay } from './useAssignmentOverlay';
import type { GhostSegment } from './assignmentGhostOverlay';
import {
  buildVisibleColumns,
  toggleQuarter,
  toggleYear,
  type Quarter,
  type TimeAxisState,
  NAME_COLUMN_WIDTH,
} from './timeAxis';

// ---------------------------------------------------------------------------
// Inner component — runs *inside* ProjectColorMapProvider so the timeline
// rows can call `useProjectColor` for segment fills.
// ---------------------------------------------------------------------------

function CapacityTimelineInner({
  data: providedData,
  onPersonClick,
}: {
  data?: ScopedTimelineData;
  onPersonClick?: (personId: string) => void;
}) {
  const { groupBy } = useCapacityScope();
  // Fall back to a local fetch when no upstream data is provided. The
  // workspace passes a hoisted snapshot (so FilterChipBar and the
  // timeline share one fetch); legacy/standalone callers still work.
  const localData = useScopedTimelineData(providedData !== undefined);
  const data = providedData ?? localData;
  const { registerVisibleProjects } = useProjectColorMap();

  // v5.2 W5 — assignment-mode overlay. When `session !== null`, the hook
  // fetches project + per-request data and returns a `ghostMap` keyed by
  // personId × month. Empty map when assignment mode is off.
  const overlay = useAssignmentOverlay(data);
  const { setMonthAssignment, clearMonthAssignment } = useAssignmentState();

  // Register newly-discovered project ids with the color map. The
  // map keeps existing assignments stable; new ids get appended so
  // segment colors don't reshuffle on filter / scope changes.
  useEffect(() => {
    if (data.visibleProjectIds.length > 0) {
      registerVisibleProjects(data.visibleProjectIds);
    }
  }, [data.visibleProjectIds, registerVisibleProjects]);

  // Register the active session's project id too — its color may not be
  // present in `visibleProjectIds` (e.g., if the project has no current
  // allocations on these people yet). Registering keeps the ghost
  // border / fill stable across renders and matches the
  // assignment-panel chip color.
  useEffect(() => {
    if (overlay.active && overlay.projectId) {
      registerVisibleProjects([overlay.projectId]);
    }
  }, [overlay.active, overlay.projectId, registerVisibleProjects]);

  // Gesture handlers per §9.6.
  const handleGhostClick = (
    personId: string,
    ghost: GhostSegment,
    month: string,
  ) => {
    setMonthAssignment(ghost.requestId, month, personId, ghost.hours);
  };
  const handleSessionClick = (
    _personId: string,
    ghost: GhostSegment,
    month: string,
  ) => {
    // Single-person flow (W4) — clearing the month removes the user's
    // session assignment for that request × month, which the next render
    // re-paints as a ghost via `buildGhostMap`.
    clearMonthAssignment(ghost.requestId, month);
  };

  // Time-axis state: seeded from the hook's `defaultState` once we
  // know the visible months. Re-seed when the months window changes
  // (currently a constant, but kept defensive for future window
  // drivers like the dashboard date filter).
  const [axisState, setAxisState] = useState<TimeAxisState>(() => data.defaultState);
  useEffect(() => {
    // Re-seed only when the year set changes — preserve user-driven
    // expand/collapse during data refetches.
    setAxisState((prev) => {
      const prevYears = Object.keys(prev).join(',');
      const nextYears = Object.keys(data.defaultState).join(',');
      if (prevYears === nextYears) return prev;
      return data.defaultState;
    });
  }, [data.defaultState]);

  const columns = useMemo(
    () => buildVisibleColumns(axisState, data.months),
    [axisState, data.months],
  );

  const totalColumnsWidth = useMemo(
    () => columns.reduce((s, c) => s + c.width, 0),
    [columns],
  );

  // ---- Render gates ----

  if (data.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (data.error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load timeline data: {data.error}
        </CardContent>
      </Card>
    );
  }

  if (data.unsupportedReason) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
          {data.unsupportedReason === 'no-cc-selected' && (
            <>
              <span className="font-medium text-foreground">No cost centre selected</span>
              <span>Pick a cost centre from the My CC dropdown to view the timeline.</span>
            </>
          )}
          {data.unsupportedReason === 'org-scope-not-yet-supported' && (
            <>
              <span className="font-medium text-foreground">
                Org-scope timeline coming in W3 Track B / S7
              </span>
              <span>
                Switch to the My CC pill (or pick a cost centre) to render the
                person-level timeline. Org-wide health surfaces in the dashboard
                cards above.
              </span>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (
    (groupBy === 'role' && data.roleGroups.length === 0) ||
    (groupBy === 'person' && data.flatPeople.length === 0)
  ) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No people match the current filters in this scope.
        </CardContent>
      </Card>
    );
  }

  // Total grid width = sticky-name column + all time columns. The
  // outer wrapper allows horizontal scroll past the viewport.
  const minWidth = NAME_COLUMN_WIDTH + totalColumnsWidth;

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <div style={{ minWidth }}>
        <TimeAxisHeader
          columns={columns}
          onToggleYear={(year) => setAxisState((s) => toggleYear(s, year))}
          onToggleQuarter={(year, q: Quarter) =>
            setAxisState((s) => toggleQuarter(s, year, q))
          }
        />

        <div role="rowgroup">
          {groupBy === 'project' ? (
            <ProjectGroupView columns={columns} />
          ) : groupBy === 'role' ? (
            data.roleGroups.map((g) => (
              <RoleGroup
                key={g.roleId}
                data={g}
                columns={columns}
                onPersonClick={onPersonClick}
                matchingRoleLabels={
                  overlay.active ? overlay.matchingRoleLabels : undefined
                }
                ghostMap={overlay.active ? overlay.ghostMap : undefined}
                onGhostClick={overlay.active ? handleGhostClick : undefined}
                onSessionClick={
                  overlay.active ? handleSessionClick : undefined
                }
              />
            ))
          ) : (
            data.flatPeople.map((p) => (
              <FlatPersonRow
                key={p.personId}
                data={p}
                columns={columns}
                onRowClick={onPersonClick}
                ghostsByMonth={
                  overlay.active
                    ? overlay.ghostMap.get(p.personId)
                    : undefined
                }
                onGhostClick={
                  overlay.active
                    ? (g, m) => handleGhostClick(p.personId, g, m)
                    : undefined
                }
                onSessionClick={
                  overlay.active
                    ? (g, m) => handleSessionClick(p.personId, g, m)
                    : undefined
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface CapacityTimelineProps {
  /**
   * Optional hoisted timeline data — when the parent already calls
   * `useScopedTimelineData()` (e.g., the workspace shares it with
   * `FilterChipBar`), pass the snapshot here so the timeline doesn't
   * issue a second fetch. Standalone callers can omit it; the timeline
   * will fetch its own copy.
   */
  data?: ScopedTimelineData;
  /**
   * Side-panel callback — opens PersonDetail (S5a) for the clicked
   * person. Track A doesn't depend on S5a being merged; if no callback
   * is provided the row click is a no-op (keyboard activation still
   * works, also as no-op).
   */
  onPersonClick?: (personId: string) => void;
}

/**
 * Public component. The `ProjectColorMapProvider` lives at App.tsx
 * level so the timeline rows and the side-panel `PersonDetail` share a
 * single color map (the side panel is rendered inside `AppLayout`,
 * outside the workspace tree, so a per-route provider would split the
 * map between them).
 */
export function CapacityTimeline({ data, onPersonClick }: CapacityTimelineProps) {
  return <CapacityTimelineInner data={data} onPersonClick={onPersonClick} />;
}

export default CapacityTimeline;
