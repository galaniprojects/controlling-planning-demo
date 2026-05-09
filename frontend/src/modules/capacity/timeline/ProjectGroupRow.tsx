/**
 * ProjectGroupRow — v5.2 W5 Track B (spec §10.3).
 *
 * Project-header row at the top of each project group. Mirrors the
 * sticky-name + bar-cells pattern from `RoleGroup`'s aggregate row, but:
 *
 *   - Name cell shows project name + hierarchy badge (e.g. "TBS") + PL
 *     name + a staffing-status badge `"3/3 ✓"` (green) | `"2/4"` (amber)
 *     | `"0/3"` (red).
 *   - Bar cells render a `<FulfillmentBar>` per visible time column with
 *     a solid+dashed visual showing assigned vs requested hours, scaled
 *     to a reference maximum across all visible projects.
 *
 * The whole row is clickable: clicking opens the side-panel project
 * summary (§10.8) via `onRowClick`.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type TimeColumn,
  NAME_COLUMN_WIDTH,
  shortMonthLabel,
  quarterLabel,
} from './timeAxis';
import { FulfillmentBar } from './FulfillmentBar';
import type { CapacityProjectItem } from '@/types/api';

export type StaffingStatus = 'green' | 'amber' | 'red' | 'neutral';

/** Map fully/total → status colour + label per §10.3.
 *
 * `total === 0` (project with zero resource requests in window) renders
 * a neutral em-dash badge — pre-W5 it returned green-✓ which read as
 * "fully assigned" but there's nothing to assign (P1 #6 fix).
 */
export function staffingStatus(
  fullyAssigned: number,
  total: number,
): { kind: StaffingStatus; label: string } {
  if (total === 0) return { kind: 'neutral', label: '—' };
  if (fullyAssigned === total) return { kind: 'green', label: `${fullyAssigned}/${total} ✓` };
  if (fullyAssigned === 0) return { kind: 'red', label: `0/${total}` };
  return { kind: 'amber', label: `${fullyAssigned}/${total}` };
}

const STATUS_CLASSES: Record<StaffingStatus, string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
};

export interface ProjectGroupRowProps {
  item: CapacityProjectItem;
  columns: readonly TimeColumn[];
  /** Highest single-month requested hours across all visible projects. */
  referenceMaxHours: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onRowClick?: (projectId: string) => void;
}

export function ProjectGroupRow({
  item,
  columns,
  referenceMaxHours,
  expanded,
  onToggleExpanded,
  onRowClick,
}: ProjectGroupRowProps) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  const status = staffingStatus(
    item.fully_assigned_request_count,
    item.total_request_count,
  );

  // Build a per-month lookup once so col rendering is O(visible months).
  const demandByMonth = new Map<string, { requested: number; assigned: number }>();
  for (const m of item.monthly_demand) {
    demandByMonth.set(m.month, {
      requested: m.requested_hours,
      assigned: m.assigned_hours,
    });
  }

  const handleNameClick = (e: React.MouseEvent) => {
    // Click on the chevron itself toggles expand/collapse; click on the
    // name area opens the side-panel summary. Stop the row click bubble
    // when clicking the chevron.
    e.stopPropagation();
    onRowClick?.(item.project_id);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpanded();
  };

  return (
    <div
      className={cn(
        'flex h-9 items-stretch border-b border-border/60',
        'bg-muted/30 hover:bg-accent/30 cursor-pointer transition-colors',
      )}
      role="row"
      onClick={() => onRowClick?.(item.project_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick?.(item.project_id);
        }
      }}
      tabIndex={0}
      aria-label={`Project: ${item.project_name}, ${status.label} requests assigned`}
    >
      {/* Sticky-left name cell */}
      <div
        className="sticky left-0 z-[5] flex flex-col justify-center gap-0.5 border-r border-border bg-muted/30 px-2 py-1 text-xs"
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleChevronClick}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse project' : 'Expand project'}
            className={cn(
              'shrink-0 rounded p-0.5 transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNameClick}
            className={cn(
              'min-w-0 flex-1 truncate text-left font-medium text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm',
            )}
            title={item.project_name}
          >
            {item.project_name}
          </button>
          <span
            className={cn(
              'shrink-0 rounded-sm px-1 py-0 text-[9px] font-medium tabular-nums',
              STATUS_CLASSES[status.kind],
            )}
            aria-label={`${status.label} requests assigned`}
          >
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 pl-5 text-[10px] text-muted-foreground">
          {item.hierarchy_node_name && (
            <span
              className="rounded-sm bg-secondary/60 px-1 py-0 text-[9px] font-medium uppercase tracking-wide text-secondary-foreground"
              title={item.hierarchy_node_name}
            >
              {item.hierarchy_node_name}
            </span>
          )}
          {item.pl_name && (
            <span className="truncate" title={item.pl_name}>
              {item.pl_name}
            </span>
          )}
        </div>
      </div>

      {/* Bar cells */}
      {columns.map((col) => {
        // Sum requested + assigned across the months in the column (single
        // for `month`, 3 for collapsed quarter, up to 12 for collapsed year).
        let requested = 0;
        let assigned = 0;
        for (const m of col.months) {
          const d = demandByMonth.get(m);
          if (d) {
            requested += d.requested;
            assigned += d.assigned;
          }
        }

        const ctx =
          col.type === 'month'
            ? `${shortMonthLabel(col.month)} ${col.month.slice(0, 4)}`
            : col.type === 'quarter'
              ? `${quarterLabel(col.quarter)} ${col.year} sum`
              : `${col.year} sum`;

        return (
          <div
            key={col.key}
            className={cn(
              'flex shrink-0 items-center justify-center px-0.5 py-1',
              col.type !== 'month' && 'bg-muted/10',
            )}
            style={{ width: col.width }}
          >
            <FulfillmentBar
              projectId={item.project_id}
              requestedHours={requested}
              assignedHours={assigned}
              referenceMaxHours={referenceMaxHours}
              contextLabel={ctx}
              isSummary={col.type !== 'month'}
            />
          </div>
        );
      })}
    </div>
  );
}
