/**
 * SegmentBar — single horizontal stacked bar inside a timeline cell.
 *
 * Spec refs: §3.1 (visual model), §3.4 (hover tooltips), §4.4 (collapsed
 * period summary opacity + over-allocation border).
 *
 * The bar is rendered as a flex row of fixed-percentage segments
 * inside a relatively-positioned wrapper that draws the over-allocation
 * border when needed. The total fill % == sum of segments and equals
 * the utilization percentage; idle space is the remainder up to 100%.
 *
 * When a row's data source can't furnish per-project breakdown (e.g.
 * the org-heatmap pivot) the caller passes a single fallback segment
 * with a neutral color — the bar still renders and over-allocation
 * still surfaces.
 */
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';

export interface BarSegment {
  projectId: string;
  projectName: string;
  hours: number;
  /**
   * Percentage of the bar's total available capacity (= standardHours)
   * occupied by this segment. 100 means a full FTE-month of this project.
   */
  pct: number;
}

export interface SegmentBarProps {
  /** Segments for this cell, in stable order (typically project-id ascending). */
  segments: BarSegment[];
  /** Total utilization % across all segments. May exceed 100. */
  utilization: number;
  /** Standard hours (denominator); used for tooltip math. */
  standardHours: number;
  /** Allocated hours (sum of segment hours); used for tooltip math. */
  allocatedHours: number;
  /**
   * `month` cells render at full opacity; collapsed quarter/year cells
   * render slightly faded per §4.4.
   */
  isSummary?: boolean;
  /**
   * For summary cells: even when avg ≤ 100%, the red border applies
   * if any underlying month exceeded 100% (§4.4).
   */
  hadAnyMonthOverAllocated?: boolean;
  /** Tooltip context label (e.g. month "Apr 2026" or "Q3 2026 avg"). */
  contextLabel: string;
  /**
   * Optional per-month breakdown for the summary tooltip
   * (e.g. "Oct: 88%, Nov: 92%, Dec: 105%").
   */
  monthBreakdown?: { month: string; utilization: number }[];
}

/**
 * One colored segment inside the bar. Wraps in its own tooltip so
 * hover-target precision matches the visible segment area.
 */
function Segment({
  seg,
  totalHours,
  contextLabel,
}: {
  seg: BarSegment;
  totalHours: number;
  contextLabel: string;
}) {
  const color = useProjectColor(seg.projectId);
  const utilContribution = seg.pct;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="h-full"
          style={{
            width: `${Math.min(seg.pct, 200)}%`,
            backgroundColor: color,
          }}
          aria-label={`${seg.projectName}: ${seg.hours.toFixed(1)} hours`}
        />
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">{seg.projectName}</div>
        <div className="text-[11px] opacity-90">
          {contextLabel} — {seg.hours.toFixed(1)}h ({utilContribution.toFixed(1)}%
          {totalHours > 0 ? ` of ${totalHours.toFixed(0)}h` : ''})
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function SegmentBar({
  segments,
  utilization,
  standardHours,
  allocatedHours,
  isSummary = false,
  hadAnyMonthOverAllocated = false,
  contextLabel,
  monthBreakdown,
}: SegmentBarProps) {
  const isOverAllocated = utilization > 100 || hadAnyMonthOverAllocated;
  const idlePct = Math.max(0, 100 - utilization);
  const totalAllocPct = Math.min(utilization, 100);

  // Build segment widths normalised so that the sum equals utilization%.
  // Segments are rendered as a fixed-width inner row; the outer 100%-track
  // handles the idle remainder.
  return (
    <div
      className={cn(
        'relative h-3 w-full overflow-hidden rounded-[2px]',
        // Track background: very faint gray, dark-mode aware.
        'bg-muted/40',
      )}
      style={{
        opacity: isSummary ? 0.85 : 1,
        // Over-allocation border draws *outside* the bar via outline so
        // it doesn't clip the segments.
        outline: isOverAllocated ? '1.5px solid var(--destructive, #dc2626)' : 'none',
        outlineOffset: isOverAllocated ? '0.5px' : undefined,
      }}
    >
      {/* Filled portion */}
      <div className="flex h-full" style={{ width: `${totalAllocPct}%` }}>
        {segments.length === 0 && allocatedHours > 0 ? (
          // No project breakdown available — fall back to a neutral fill.
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-full w-full bg-primary/60" />
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="font-medium">Allocated</div>
              <div className="text-[11px] opacity-90">
                {contextLabel} — {allocatedHours.toFixed(1)}h ({utilization.toFixed(1)}%)
              </div>
              {monthBreakdown && monthBreakdown.length > 0 && (
                <div className="mt-1 text-[10px] opacity-75">
                  {monthBreakdown
                    .map((m) => `${m.month.slice(5)}: ${m.utilization.toFixed(0)}%`)
                    .join(', ')}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          segments.map((s) => (
            <Segment
              key={s.projectId}
              seg={{
                ...s,
                // Normalize each segment's width so total equals utilization
                // (segments report pct relative to standardHours; the inner
                // track is `totalAllocPct%` wide of the parent so sub-segments
                // need to expand back out to consume that local space).
                pct: utilization > 0 ? (s.pct / utilization) * 100 : 0,
              }}
              totalHours={standardHours}
              contextLabel={contextLabel}
            />
          ))
        )}
      </div>

      {/* Idle gap tooltip target */}
      {idlePct > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute right-0 top-0 h-full"
              style={{ width: `${idlePct}%` }}
              aria-label={`Available: ${(standardHours - allocatedHours).toFixed(1)} hours`}
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="font-medium">Available</div>
            <div className="text-[11px] opacity-90">
              {contextLabel} — {Math.max(0, standardHours - allocatedHours).toFixed(1)}h
              ({idlePct.toFixed(1)}%)
            </div>
            {monthBreakdown && monthBreakdown.length > 0 && (
              <div className="mt-1 text-[10px] opacity-75">
                {monthBreakdown
                  .map((m) => `${m.month.slice(5)}: ${m.utilization.toFixed(0)}%`)
                  .join(', ')}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
