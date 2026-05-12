/**
 * RoleGroup — v5.2 W3 Track A (spec §3.3 — aggregate role row).
 *
 * One expandable section per role. The aggregate row (always visible)
 * shows a single bar at 50% opacity representing the average utilization
 * of all people in the role. No project-color segments — just a neutral
 * tone (per §3.3: "single color (the role's dominant project color, or
 * a neutral gray if mixed)" — we use neutral gray for the aggregate
 * since "dominant" is ambiguous when several projects are co-equal).
 *
 * Person rows live below the chevron and toggle visibility on click of
 * the chevron itself; clicking the rest of the aggregate row does NOT
 * toggle (clicking a person row opens the side panel — wired in S5a).
 *
 * Sorting (§3.6): peak utilization desc, then alphabetical.
 *
 * v5.2 W5 Track A (S6b, §9.4): when assignment mode is active and the
 * role's label is in `matchingRoleLabels`, the section auto-expands so
 * the user sees ghost segments on candidate people without an extra
 * click. Ghost props pass through to each `PersonTimelineRow`.
 */
import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type TimeColumn,
  type MonthCell,
  NAME_COLUMN_WIDTH,
  computePeriodSummary,
  shortMonthLabel,
  quarterLabel,
} from './timeAxis';
import { SegmentBar } from './SegmentBar';
import {
  PersonTimelineRow,
  type PersonRowData,
} from './PersonTimelineRow';
import type { GhostMap, GhostSegment } from './assignmentGhostOverlay';

export interface RoleGroupData {
  roleId: string;
  roleName: string;
  /** Aggregate (mean) utilization cells across all people in this role. */
  aggregateCellsByMonth: Record<string, MonthCell>;
  /** People rows belonging to this role, already sorted per §3.6. */
  people: PersonRowData[];
}

interface RoleGroupProps {
  data: RoleGroupData;
  columns: readonly TimeColumn[];
  /** Default `true`; the parent may collapse roles by default in dense scopes. */
  defaultExpanded?: boolean;
  onPersonClick?: (personId: string) => void;
  /**
   * v5.2 W5 — set of role labels referenced by the active assignment
   * session's resource requests. Roles in this set auto-expand on
   * session-mode entry per §9.4 ("Role groups that contain matching
   * people auto-expand if they were collapsed"). `undefined` ↔ no
   * assignment session active.
   */
  matchingRoleLabels?: Set<string>;
  /** Per-person ghost segment map — see `useAssignmentOverlay`. */
  ghostMap?: GhostMap;
  /** Forwarded to each `PersonTimelineRow` (assignment gesture). */
  onGhostClick?: (
    personId: string,
    ghost: GhostSegment,
    month: string,
  ) => void;
  onSessionClick?: (
    personId: string,
    ghost: GhostSegment,
    month: string,
  ) => void;
}

/**
 * Aggregate-row bar cells. Identical math to PersonTimelineRow's
 * but always rendered as a `summary`-style bar (50% opacity per §3.3)
 * with NO per-project segments — the aggregate row reflects role
 * health at a glance, not project mix.
 */
function renderAggregateCells({
  columns,
  aggregateCellsByMonth,
}: {
  columns: readonly TimeColumn[];
  aggregateCellsByMonth: Record<string, MonthCell>;
}): React.ReactNode[] {
  return columns.map((col) => {
    const monthCells: MonthCell[] = [];
    for (const m of col.months) {
      const c = aggregateCellsByMonth[m];
      if (c) monthCells.push(c);
    }

    if (monthCells.length === 0) {
      return (
        <div
          key={col.key}
          className="flex shrink-0 items-center justify-center px-0.5 py-1"
          style={{ width: col.width }}
        >
          <div className="h-3 w-full rounded-[2px] bg-muted/20" />
        </div>
      );
    }

    if (col.type === 'month') {
      const c = monthCells[0];
      return (
        <div
          key={col.key}
          className="flex shrink-0 items-center justify-center px-0.5 py-1"
          style={{ width: col.width }}
        >
          <SegmentBar
            segments={[]}
            utilization={c.utilization}
            standardHours={c.standardHours}
            allocatedHours={c.allocatedHours}
            contextLabel={`${shortMonthLabel(c.month)} ${c.month.slice(0, 4)} (role avg)`}
            // Aggregate role bar is always rendered at 50% opacity;
            // we mirror that by using `isSummary` (0.85) plus an extra
            // opacity wrapper handled by the row container below.
            isSummary
          />
        </div>
      );
    }

    const summary = computePeriodSummary(monthCells);
    const avgStd = summary.totalStandardHours / monthCells.length;
    const avgAlloc = summary.totalAllocatedHours / monthCells.length;
    const ctx =
      col.type === 'quarter'
        ? `${quarterLabel(col.quarter)} ${col.year} avg (role)`
        : `${col.year} avg (role)`;
    return (
      <div
        key={col.key}
        className="flex shrink-0 items-center justify-center bg-muted/10 px-0.5 py-1"
        style={{ width: col.width }}
      >
        <SegmentBar
          segments={[]}
          utilization={summary.utilization}
          standardHours={avgStd}
          allocatedHours={avgAlloc}
          contextLabel={ctx}
          isSummary
          hadAnyMonthOverAllocated={summary.hadOverAllocation}
          monthBreakdown={monthCells.map((c) => ({
            month: c.month,
            utilization: c.utilization,
          }))}
        />
      </div>
    );
  });
}

export function RoleGroup({
  data,
  columns,
  defaultExpanded = true,
  onPersonClick,
  matchingRoleLabels,
  ghostMap,
  onGhostClick,
  onSessionClick,
}: RoleGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = expanded ? ChevronDown : ChevronRight;

  // §9.4 — when the active assignment session references this role,
  // force-expand the section so candidate ghosts are immediately
  // visible. Only fires on assignment-mode transitions; the user can
  // still collapse manually after.
  const isMatchingSection =
    matchingRoleLabels?.has(data.roleName) ?? false;
  useEffect(() => {
    if (isMatchingSection) setExpanded(true);
  }, [isMatchingSection]);

  return (
    <div role="rowgroup">
      {/* Aggregate role row */}
      <div
        className={cn(
          'flex h-7 items-stretch border-b border-border/60',
          'bg-muted/30',
        )}
        // Aggregate bars at 50% opacity per §3.3.
        style={{ opacity: 0.5 }}
        role="row"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`role-${data.roleId}-people`}
          className={cn(
            'sticky left-0 z-[5] flex items-center gap-1 border-r border-border bg-muted/30 pl-2 pr-2 text-xs font-medium',
            'whitespace-nowrap text-foreground',
            'transition-colors hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
          style={{ width: NAME_COLUMN_WIDTH }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{data.roleName}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {data.people.length}
          </span>
        </button>
        {renderAggregateCells({
          columns,
          aggregateCellsByMonth: data.aggregateCellsByMonth,
        })}
      </div>

      {/* Person rows */}
      {expanded && (
        <div id={`role-${data.roleId}-people`}>
          {data.people.map((p) => (
            <PersonTimelineRow
              key={p.personId}
              data={p}
              columns={columns}
              onRowClick={onPersonClick}
              indented
              ghostsByMonth={ghostMap?.get(p.personId)}
              onGhostClick={
                onGhostClick
                  ? (g, m) => onGhostClick(p.personId, g, m)
                  : undefined
              }
              onSessionClick={
                onSessionClick
                  ? (g, m) => onSessionClick(p.personId, g, m)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
