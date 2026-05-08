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
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { useProjectColorMap } from '@/contexts/ProjectColorMapContext';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { useScopedTimelineData } from '../hooks/useScopedTimelineData';
import { TimeAxisHeader } from './TimeAxisHeader';
import { RoleGroup } from './RoleGroup';
import { FlatPersonRow } from './FlatPersonRow';
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
  onPersonClick,
}: {
  onPersonClick?: (personId: string) => void;
}) {
  const { groupBy } = useCapacityScope();
  const data = useScopedTimelineData();
  const { registerVisibleProjects } = useProjectColorMap();

  // Register newly-discovered project ids with the color map. The
  // map keeps existing assignments stable; new ids get appended so
  // segment colors don't reshuffle on filter / scope changes.
  useEffect(() => {
    if (data.visibleProjectIds.length > 0) {
      registerVisibleProjects(data.visibleProjectIds);
    }
  }, [data.visibleProjectIds, registerVisibleProjects]);

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
          {data.unsupportedReason === 'project-view-pending' && (
            <>
              <span className="font-medium text-foreground">
                Project view ships in v5.2 W5
              </span>
              <span>
                Switch group-by to Role or Person to use the W3 timeline.
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
          {groupBy === 'role'
            ? data.roleGroups.map((g) => (
                <RoleGroup
                  key={g.roleId}
                  data={g}
                  columns={columns}
                  onPersonClick={onPersonClick}
                />
              ))
            : data.flatPeople.map((p) => (
                <FlatPersonRow
                  key={p.personId}
                  data={p}
                  columns={columns}
                  onRowClick={onPersonClick}
                />
              ))}
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
export function CapacityTimeline({ onPersonClick }: CapacityTimelineProps) {
  return <CapacityTimelineInner onPersonClick={onPersonClick} />;
}

export default CapacityTimeline;
