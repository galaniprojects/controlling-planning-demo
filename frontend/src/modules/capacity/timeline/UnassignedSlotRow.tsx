/**
 * UnassignedSlotRow — v5.2 W5 Track B (spec §10.5).
 *
 * One row per `ResourceRequest` with status `pending` or
 * `partially_fulfilled` for a project. Represents demand that has not
 * been fully staffed.
 *
 * Name cell:
 *   - Role name in italics (secondary text colour, indented 20px).
 *   - Status label: `unassigned` (warning) or `partial — Xh of Yh filled`.
 *   - An action icon — clicking opens the assignment panel for this
 *     project, pre-scrolled to the relevant role section. The Lead
 *     wires the `onSlotClick` handler to `enterAssignmentMode` after
 *     merging Track B's worktree.
 *
 * Bar cells:
 *   - Dashed-border ghost bars (see `<GhostBar>`), one per month inside
 *     the request's period. Months outside the period are empty.
 */
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type TimeColumn,
  NAME_COLUMN_WIDTH,
  shortMonthLabel,
  quarterLabel,
} from './timeAxis';
import { GhostBar } from './GhostBar';
import type { CapacityProjectSlot } from '@/types/api';

export interface UnassignedSlotRowProps {
  slot: CapacityProjectSlot;
  /** Owning project id (for color + assignment-panel routing). */
  projectId: string;
  columns: readonly TimeColumn[];
  /** Reference maximum hours across visible projects (width scaling). */
  referenceMaxHours: number;
  /**
   * Click handler — opens the assignment panel for this project,
   * pre-scrolled to this role section. The Lead wires this to
   * `enterAssignmentMode` post-merge (Track A leaves a TODO for it).
   */
  onSlotClick?: (projectId: string, requestId: number) => void;
}

export function UnassignedSlotRow({
  slot,
  projectId,
  columns,
  referenceMaxHours,
  onSlotClick,
}: UnassignedSlotRowProps) {
  // Per-month lookup.
  const monthly = new Map<string, CapacityProjectSlot['monthly'][number]>();
  for (const m of slot.monthly) monthly.set(m.month, m);

  // Aggregate to compute the "partial — Xh of Yh filled" status text.
  let totalRequested = 0;
  let totalAssigned = 0;
  for (const m of slot.monthly) {
    totalRequested += m.requested_hours;
    totalAssigned += m.assigned_hours;
  }
  const isPartial = slot.status === 'partially_fulfilled';
  const statusText = isPartial
    ? `partial — ${totalAssigned.toFixed(0)}h of ${totalRequested.toFixed(0)}h filled`
    : 'unassigned';
  const roleLabel = slot.role_name ?? 'Unspecified role';

  const handleClick = () => {
    onSlotClick?.(projectId, slot.request_id);
  };

  return (
    <div
      className={cn(
        'flex h-7 items-stretch border-b border-border/50',
        onSlotClick && 'cursor-pointer hover:bg-accent/30 transition-colors',
      )}
      role="row"
      onClick={onSlotClick ? handleClick : undefined}
      onKeyDown={
        onSlotClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      tabIndex={onSlotClick ? 0 : -1}
      aria-label={`Unassigned slot: ${roleLabel}, ${statusText}`}
    >
      {/* Sticky-left name cell — indented 20px */}
      <div
        className="sticky left-0 z-[5] flex items-center gap-1.5 border-r border-border bg-card pl-6 pr-2 text-xs"
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate italic text-muted-foreground">
              {roleLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="font-medium">{roleLabel}</div>
            <div className="text-[11px] opacity-90">
              {slot.cc_name ? `${slot.cc_name} — ` : ''}
              {slot.priority ? `${slot.priority} priority` : ''}
            </div>
            <div className="text-[11px] opacity-75">{statusText}</div>
            {slot.change_request_id && (
              <div className="text-[11px] opacity-75">CR #{slot.change_request_id}</div>
            )}
          </TooltipContent>
        </Tooltip>
        <span
          className={cn(
            'shrink-0 rounded-sm px-1 py-0 text-[9px] font-medium',
            // P2 #14 fix: spec §10.5 distinguishes "warning" (unassigned)
            // from amber (partial). Pre-fix both branches used identical
            // amber classes — dead ternary. Now red for fully unassigned,
            // amber for partially fulfilled.
            isPartial
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          )}
        >
          {isPartial ? 'partial' : 'unassigned'}
        </span>
        {onSlotClick && (
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Bar cells */}
      {columns.map((col) => {
        let requested = 0;
        let assigned = 0;
        for (const m of col.months) {
          const c = monthly.get(m);
          if (c) {
            requested += c.requested_hours;
            assigned += c.assigned_hours;
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
            <GhostBar
              projectId={projectId}
              requestedHours={requested}
              assignedHours={assigned}
              referenceMaxHours={referenceMaxHours}
              contextLabel={ctx}
              roleName={roleLabel}
            />
          </div>
        );
      })}
    </div>
  );
}
