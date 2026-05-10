/**
 * UnassignedSummary — v5.2 W5 Track B (spec §10.7).
 *
 * Sticky-bottom row that replaces the role-view `DemandStrip` when
 * group-by-project is active. Shows a single value per visible time
 * column: the SUM of unassigned hours across ALL visible projects for
 * that period.
 *
 * Color thresholds (§10.7) — indicative; configurable in a follow-up:
 *   -    0h          → empty cell
 *   -  1–200h        → warning background (amber)
 *   - 200h+          → danger background (red)
 *
 * v5.2 W6 Track C decision (W5 polish-backlog item):
 *   The WARN/DANGER cut-offs stay hardcoded here for the v5.2 demo.
 *   Promoting them to a `PlanningParameter` row would also need:
 *     1. a backend admin endpoint to expose the parameter to the
 *        client,
 *     2. a settings card in `Administration` to edit it,
 *     3. cache-invalidation plumbing so timeline cells re-paint when
 *        the parameter changes.
 *   That's out of scope for a polish item. TODO is left below so the
 *   follow-up has a clear anchor; a placeholder seed row will be
 *   added in the v5.2 closeout PR.
 *
 * The row mirrors the `DemandStrip` sticky-bottom + sticky-left pattern
 * so users get a consistent docking element across both views.
 */
import { cn } from '@/lib/utils';
import {
  type TimeColumn,
  NAME_COLUMN_WIDTH,
} from './timeAxis';
import type { CapacityProjectItem } from '@/types/api';

// TODO(v5.2 closeout): seed `PlanningParameter` rows for these thresholds
// (`capacity.unassigned_summary.warn_threshold_hours` and
// `capacity.unassigned_summary.danger_threshold_hours`) and read them from
// the planning-parameter cache. Decision recorded in PROGRESS.md (W6).
const DANGER_THRESHOLD = 200;

export interface UnassignedSummaryProps {
  /** All visible projects (post-filter) — used to sum unassigned hours per month. */
  items: readonly CapacityProjectItem[];
  /** Visible columns (matched against timeline grid for alignment). */
  columns: readonly TimeColumn[];
}

function thresholdClasses(hours: number): string {
  if (hours <= 0) return '';
  if (hours < DANGER_THRESHOLD) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
}

export function UnassignedSummary({ items, columns }: UnassignedSummaryProps) {
  // Build a per-month sum of unassigned hours across all visible projects.
  const unassignedByMonth = new Map<string, number>();
  for (const it of items) {
    // Sum unfulfilled-slot remainders per month, summed across all
    // unfulfilled slots for this project.
    for (const slot of it.unfulfilled_slots) {
      for (const m of slot.monthly) {
        const remaining = Math.max(0, m.requested_hours - m.assigned_hours);
        unassignedByMonth.set(
          m.month,
          (unassignedByMonth.get(m.month) ?? 0) + remaining,
        );
      }
    }
  }

  return (
    <div
      role="row"
      aria-label="Total unassigned hours summary"
      className="sticky bottom-0 z-10 flex h-9 items-stretch border-t border-border bg-card/95 backdrop-blur-sm"
    >
      {/* Sticky-left label cell */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-3 text-xs font-medium text-muted-foreground"
        style={{ width: NAME_COLUMN_WIDTH, minWidth: NAME_COLUMN_WIDTH }}
      >
        Total unassigned hours
      </div>

      {/* Per-period cells */}
      {columns.map((col) => {
        let total = 0;
        for (const m of col.months) {
          total += unassignedByMonth.get(m) ?? 0;
        }
        const showLabel = total > 0;
        const cls = thresholdClasses(total);
        return (
          <div
            key={col.key}
            className={cn(
              'flex shrink-0 items-center justify-center border-l border-border text-[11px] font-medium tabular-nums',
              col.type !== 'month' && 'bg-muted/10',
              showLabel && cls,
            )}
            style={{ width: col.width }}
            aria-label={
              showLabel
                ? `${total.toFixed(0)} unassigned hours`
                : 'No unassigned hours'
            }
          >
            {showLabel ? `${total.toFixed(0)}h` : ''}
          </div>
        );
      })}
    </div>
  );
}
