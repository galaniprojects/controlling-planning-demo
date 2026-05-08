/**
 * PersonTimelineRow — v5.2 W3 Track A (spec §3.1, §3.3, §3.4, §4.4).
 *
 * One person row in the timeline. Columns to the right of the
 * sticky-left name cell render `<SegmentBar>` cells whose visual model
 * is described in §3.1:
 *
 *   - Bar's filled width  = utilization % vs available capacity.
 *   - Bar is subdivided   = colored segments per project (§3.2 colors).
 *   - Empty gap on right  = idle capacity.
 *   - 1.5px red border    = total > 100% (or any month > 100% inside a
 *                           collapsed period — §4.4).
 *
 * The component is data-source-agnostic: it consumes the normalized
 * `PersonRowData` produced by `useScopedTimelineData`, which already
 * resolved per-month / per-project hours.
 */
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type TimeColumn,
  type MonthCell,
  NAME_COLUMN_WIDTH,
  computePeriodSummary,
  shortMonthLabel,
  quarterLabel,
} from './timeAxis';
import { SegmentBar, type BarSegment } from './SegmentBar';

export interface PersonRowData {
  personId: string;
  personName: string;
  roleId: string;
  roleName: string;
  /** Lookup table keyed by "YYYY-MM" → MonthCell with utilization + projects. */
  cellsByMonth: Record<string, MonthCell>;
  /**
   * Optional project-id → project-name mapping so segments can render
   * full project names in tooltips without an extra fetch.
   */
  projectNames: Record<string, string>;
  /** Pre-computed: peak utilization across the visible window (for sorting). */
  peakUtilization: number;
}

interface PersonTimelineRowProps {
  data: PersonRowData;
  columns: readonly TimeColumn[];
  onRowClick?: (personId: string) => void;
  /** Visual indent for nested-under-role-group rows. */
  indented?: boolean;
}

/**
 * Build the per-cell `BarSegment[]` from a `MonthCell` (for `month`
 * columns) or a synthesized `MonthCell` (for collapsed periods).
 *
 * Project segments share a stable order: descending hours first, then
 * project_id alphabetical for tie-breaking. This keeps rendering
 * deterministic across re-renders and matches the side-panel's
 * "Allocations" listing in S5a.
 */
function buildSegments(
  cell: MonthCell,
  projectNames: Record<string, string>,
): BarSegment[] {
  if (!cell.projects.length) return [];
  const stdHours = cell.standardHours > 0 ? cell.standardHours : 1;
  return cell.projects
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.projectId.localeCompare(b.projectId))
    .map((p) => ({
      projectId: p.projectId,
      projectName: projectNames[p.projectId] ?? p.projectId,
      hours: p.hours,
      pct: (p.hours / stdHours) * 100,
    }));
}

/**
 * Render one row of bar cells against a TimeColumn list. Used by both
 * `PersonTimelineRow` and `RoleGroup`'s aggregate (RoleGroup overrides
 * the segment-color behavior).
 */
export function renderBarCells({
  columns,
  cellsByMonth,
  projectNames,
  isAggregate = false,
}: {
  columns: readonly TimeColumn[];
  cellsByMonth: Record<string, MonthCell>;
  projectNames: Record<string, string>;
  isAggregate?: boolean;
}): React.ReactNode[] {
  return columns.map((col) => {
    const monthCells: MonthCell[] = [];
    for (const m of col.months) {
      const c = cellsByMonth[m];
      if (c) monthCells.push(c);
    }

    // Empty cells (no data for any month in the period) render as
    // a faint placeholder so the row keeps its grid alignment.
    if (monthCells.length === 0) {
      return (
        <div
          key={col.key}
          className="flex shrink-0 items-center justify-center px-0.5 py-1"
          style={{ width: col.width }}
        >
          <div className="h-3 w-full rounded-[2px] bg-muted/30" />
        </div>
      );
    }

    // Single month: utilization + project segments come straight from the cell.
    if (col.type === 'month') {
      const c = monthCells[0];
      return (
        <div
          key={col.key}
          className="flex shrink-0 items-center justify-center px-0.5 py-1"
          style={{ width: col.width }}
        >
          <SegmentBar
            segments={buildSegments(c, projectNames)}
            utilization={c.utilization}
            standardHours={c.standardHours}
            allocatedHours={c.allocatedHours}
            contextLabel={`${shortMonthLabel(c.month)} ${c.month.slice(0, 4)}`}
            isSummary={isAggregate}
          />
        </div>
      );
    }

    // Collapsed quarter or year: average utilization, sum segment hours.
    const summary = computePeriodSummary(monthCells);
    const avgStd = summary.totalStandardHours / monthCells.length;
    const avgAlloc = summary.totalAllocatedHours / monthCells.length;
    const segments: BarSegment[] = summary.projectHours
      .filter((p) => p.hours > 0)
      .sort((a, b) => b.hours - a.hours || a.projectId.localeCompare(b.projectId))
      .map((p) => ({
        projectId: p.projectId,
        projectName: projectNames[p.projectId] ?? p.projectId,
        hours: p.hours / monthCells.length, // avg/month for tooltip readability
        // Segment width is proportional to project hours over period
        // standard hours, scaled to a per-month utilization reference.
        pct:
          summary.totalStandardHours > 0
            ? (p.hours / summary.totalStandardHours) * 100
            : 0,
      }));

    const ctx =
      col.type === 'quarter'
        ? `${quarterLabel(col.quarter)} ${col.year} avg`
        : `${col.year} avg`;

    return (
      <div
        key={col.key}
        className={cn(
          'flex shrink-0 items-center justify-center px-0.5 py-1',
          // Slightly distinct background for collapsed periods so the
          // user can locate them at a glance.
          'bg-muted/10',
        )}
        style={{ width: col.width }}
      >
        <SegmentBar
          segments={segments}
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

export function PersonTimelineRow({
  data,
  columns,
  onRowClick,
  indented = false,
}: PersonTimelineRowProps) {
  const handleClick = () => onRowClick?.(data.personId);

  return (
    <div
      className={cn(
        'flex h-7 cursor-pointer items-stretch border-b border-border/50',
        'hover:bg-accent/30 transition-colors',
      )}
      role="row"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      tabIndex={0}
    >
      {/* Sticky-left name cell — fixed 160px per §4.6 */}
      <div
        className={cn(
          'sticky left-0 z-[5] flex items-center border-r border-border bg-card pr-2 text-xs',
          'whitespace-nowrap',
          indented ? 'pl-6' : 'pl-2',
        )}
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate text-foreground">{data.personName}</span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="font-medium">{data.personName}</div>
            <div className="text-[11px] opacity-90">{data.roleName}</div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Bar cells */}
      {renderBarCells({
        columns,
        cellsByMonth: data.cellsByMonth,
        projectNames: data.projectNames,
      })}
    </div>
  );
}
