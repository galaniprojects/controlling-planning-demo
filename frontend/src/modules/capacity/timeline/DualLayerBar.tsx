/**
 * DualLayerBar — v5.2 W5 Track B (spec §10.4).
 *
 * Two-layer bar used by `AssignedPersonRow` to show ONE project's
 * allocation in context of the person's TOTAL utilization across all
 * projects:
 *
 *   1. Background layer (15% opacity, neutral gray): width = total
 *      utilization percentage. Shows whether the person is near
 *      capacity overall.
 *   2. Foreground layer (project color, full opacity): width = this
 *      project's hours as a proportion of standard hours.
 *
 * Width semantics per §10.4: both layers are sized **relative to the
 * person's standard available capacity** (= 100% utilization). The bar
 * tells the same story as the role-view bar but layered: a small green
 * foreground against a wide gray background = "this person is heavily
 * allocated overall, but only a small portion is for this project."
 *
 * Over-allocation (>100% total) draws the same 1.5px red outline used
 * by `SegmentBar` (spec §3.1) so the visual language stays consistent.
 */
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';

export interface DualLayerBarProps {
  /** Project id (drives foreground colour via `useProjectColor`). */
  projectId: string;
  /** Hours allocated to THIS project for the period. */
  thisProjectHours: number;
  /** Total hours across ALL projects for the period. */
  totalHoursAllProjects: number;
  /** Standard available hours (100% reference). */
  standardHours: number;
  /** Total utilization % across all projects (precomputed). */
  totalUtilizationPct: number;
  /** Project name (for the tooltip). */
  projectName: string;
  /** Period label for tooltip (e.g., "Apr 2026"). */
  contextLabel: string;
  /** Lower opacity for collapsed-period summary cells (§4.4 / §10.11). */
  isSummary?: boolean;
  /**
   * Even when avg ≤ 100%, draw the red over-allocation border if any
   * underlying month exceeded 100%. Used by collapsed-period summaries.
   */
  hadAnyMonthOverAllocated?: boolean;
}

export function DualLayerBar({
  projectId,
  thisProjectHours,
  totalHoursAllProjects,
  standardHours,
  totalUtilizationPct,
  projectName,
  contextLabel,
  isSummary = false,
  hadAnyMonthOverAllocated = false,
}: DualLayerBarProps) {
  const color = useProjectColor(projectId);
  const isOverAllocated = totalUtilizationPct > 100 || hadAnyMonthOverAllocated;

  // Background layer width = clamped total utilization (0..100% of cell).
  // Foreground layer width = this project's share of standard hours.
  const backgroundPct = Math.min(100, totalUtilizationPct);
  const foregroundPct = standardHours > 0
    ? Math.min(100, (thisProjectHours / standardHours) * 100)
    : 0;

  const thisProjectPctTotal = totalHoursAllProjects > 0
    ? (thisProjectHours / totalHoursAllProjects) * 100
    : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'relative h-3 w-full overflow-hidden rounded-[2px]',
            // Faint base track so empty cells still show.
            'bg-muted/40',
          )}
          style={{
            opacity: isSummary ? 0.85 : 1,
            outline: isOverAllocated ? '1.5px solid var(--destructive, #dc2626)' : 'none',
            outlineOffset: isOverAllocated ? '0.5px' : undefined,
          }}
          aria-label={`${projectName}: ${thisProjectHours.toFixed(0)}h (${thisProjectPctTotal.toFixed(0)}% of total)`}
        >
          {/* Background — total utilization, 15% opacity neutral gray. */}
          {backgroundPct > 0 && (
            <div
              className="absolute left-0 top-0 h-full bg-foreground"
              style={{
                width: `${backgroundPct}%`,
                opacity: 0.15,
              }}
            />
          )}
          {/* Foreground — this project's solid bar, layered on top. */}
          {foregroundPct > 0 && (
            <div
              className="absolute left-0 top-0 h-full"
              style={{
                width: `${foregroundPct}%`,
                backgroundColor: color,
              }}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">{projectName}</div>
        <div className="text-[11px] opacity-90">
          {contextLabel} — {thisProjectHours.toFixed(0)}h ({thisProjectPctTotal.toFixed(0)}%)
        </div>
        <div className="mt-0.5 text-[11px] opacity-75">
          Total: {totalUtilizationPct.toFixed(0)}% across all projects
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
