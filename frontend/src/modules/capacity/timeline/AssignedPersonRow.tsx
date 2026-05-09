/**
 * AssignedPersonRow — v5.2 W5 Track B (spec §10.4).
 *
 * One row per person allocated to a project. Shows that person's
 * allocation to THIS project (foreground) layered over their TOTAL
 * utilization (faded background) — see `DualLayerBar` for the math.
 *
 * Click semantics (§10.8): clicking opens the standard person detail
 * side panel — same content as in role view.
 */
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type TimeColumn,
  NAME_COLUMN_WIDTH,
  shortMonthLabel,
  quarterLabel,
} from './timeAxis';
import { DualLayerBar } from './DualLayerBar';
import type { CapacityProjectAssignedPerson } from '@/types/api';

export interface AssignedPersonRowProps {
  /** The person sub-record from `CapacityProjectItem.assigned_people`. */
  person: CapacityProjectAssignedPerson;
  /** Project id (drives the foreground color). */
  projectId: string;
  /** Project name (for tooltip context inside `DualLayerBar`). */
  projectName: string;
  /** Visible columns from the parent time-axis. */
  columns: readonly TimeColumn[];
  /**
   * Standard hours per FTE-month. Used to convert hours → utilization %.
   * Comes from the team-heatmap fetch; if not available the bar still
   * renders proportionally to total_utilization_pct (provided by API).
   */
  standardHours?: number;
  onPersonClick?: (personId: string) => void;
}

export function AssignedPersonRow({
  person,
  projectId,
  projectName,
  columns,
  standardHours = 160,
  onPersonClick,
}: AssignedPersonRowProps) {
  // Per-month lookup for fast col iteration.
  const monthly = new Map<string, CapacityProjectAssignedPerson['monthly'][number]>();
  for (const m of person.monthly) monthly.set(m.month, m);

  return (
    <div
      className={cn(
        'flex h-7 cursor-pointer items-stretch border-b border-border/50',
        'hover:bg-accent/30 transition-colors',
      )}
      role="row"
      onClick={() => onPersonClick?.(person.person_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPersonClick?.(person.person_id);
        }
      }}
      tabIndex={0}
      aria-label={`Assigned person: ${person.person_name}`}
    >
      {/* Sticky-left name cell — indented 20px per §10.4 */}
      <div
        className={cn(
          'sticky left-0 z-[5] flex items-center gap-1.5 border-r border-border bg-card pr-2 text-xs',
          'whitespace-nowrap pl-6',
        )}
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {person.person_name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="font-medium">{person.person_name}</div>
            {person.role_name && (
              <div className="text-[11px] opacity-90">{person.role_name}</div>
            )}
            {person.cost_center_name && (
              <div className="text-[11px] opacity-75">{person.cost_center_name}</div>
            )}
          </TooltipContent>
        </Tooltip>
        {person.role_name && (
          <span
            className="shrink-0 rounded-sm bg-secondary/60 px-1 py-0 text-[9px] font-medium uppercase tracking-wide text-secondary-foreground"
            title={person.role_name}
          >
            {person.role_name}
          </span>
        )}
      </div>

      {/* Bar cells */}
      {columns.map((col) => {
        // Aggregate this person's project hours across the months in the column.
        let thisHours = 0;
        let totalHours = 0;
        let utilSum = 0;
        let cellCount = 0;
        let hadOver = false;
        for (const m of col.months) {
          const cell = monthly.get(m);
          if (!cell) continue;
          thisHours += cell.this_project_hours;
          totalHours += cell.total_hours_all_projects;
          utilSum += cell.total_utilization_pct;
          cellCount += 1;
          if (cell.total_utilization_pct > 100) hadOver = true;
        }

        if (cellCount === 0) {
          return (
            <div
              key={col.key}
              className={cn(
                'flex shrink-0 items-center justify-center px-0.5 py-1',
                col.type !== 'month' && 'bg-muted/10',
              )}
              style={{ width: col.width }}
            >
              <div className="h-3 w-full rounded-[2px] bg-muted/30" />
            </div>
          );
        }

        // Single month uses the cell directly; collapsed periods average
        // utilization and standard hours.
        const utilization = col.type === 'month'
          ? utilSum
          : utilSum / cellCount;
        const periodStdHours = standardHours * cellCount;
        const avgStdHours = standardHours;
        const ctx =
          col.type === 'month'
            ? `${shortMonthLabel(col.month)} ${col.month.slice(0, 4)}`
            : col.type === 'quarter'
              ? `${quarterLabel(col.quarter)} ${col.year} avg`
              : `${col.year} avg`;

        return (
          <div
            key={col.key}
            className={cn(
              'flex shrink-0 items-center justify-center px-0.5 py-1',
              col.type !== 'month' && 'bg-muted/10',
            )}
            style={{ width: col.width }}
          >
            <DualLayerBar
              projectId={projectId}
              projectName={projectName}
              thisProjectHours={col.type === 'month' ? thisHours : thisHours / cellCount}
              totalHoursAllProjects={col.type === 'month' ? totalHours : totalHours / cellCount}
              standardHours={col.type === 'month' ? avgStdHours : periodStdHours / cellCount}
              totalUtilizationPct={utilization}
              contextLabel={ctx}
              isSummary={col.type !== 'month'}
              hadAnyMonthOverAllocated={hadOver}
            />
          </div>
        );
      })}
    </div>
  );
}
