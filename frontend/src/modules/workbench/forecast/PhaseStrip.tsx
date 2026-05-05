/**
 * PhaseStrip — v5.1 C-03 milestone phase strip rendered as a `<TableRow>` in
 * the F&P grid header. Sits below the year header and the month/quarter
 * header (top-20, the next sticky tier after top-0 / top-10) and above all
 * data rows.
 *
 * Each contiguous run of columns belonging to the same milestone phase
 * collapses into a single segment cell with `colSpan = run.span`. Segments
 * carry the milestone's resolved colour (own override or
 * MilestoneType.default_color, falling back to a deterministic palette) at
 * ~70% alpha and show the phase name truncated with an ellipsis when narrow.
 * The full label is shown via Tooltip on hover.
 *
 * Baseline-vs-forecast slip indicator: when `slipMonths > 0` we render a
 * small gray triangle at the baseline column inside the strip (anchored
 * above) and a thin red line connecting the baseline triangle to the actual
 * forecast boundary. Colours follow the same semantic convention used by
 * `MilestonesTab` (gray for baseline marker, red for slip).
 */
import { Fragment, useMemo } from 'react';
import { TableHead, TableRow } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MilestoneResponse } from '@/types/milestones';
import {
  buildPhaseSegments,
  mapColumnsToPhases,
  withAlpha,
  type PhaseInfo,
  type PhaseSegment,
} from './phaseHelpers';

/**
 * Minimal column descriptor the strip needs. Mirrors the parent's
 * `DisplayColumn` discriminator — the strip only cares about whether a
 * column is data-bearing (and what its key is) or a yearTotal break.
 */
export interface PhaseStripColumn {
  /** The column key when `kind === 'data'`; null for yearTotal columns. */
  key: string | null;
  /** Discriminator for legibility at the call site. */
  kind: 'data' | 'yearTotal';
}

interface PhaseStripProps {
  /**
   * The full ordered display-column list. yearTotal entries supply
   * `key: null` so the strip can break segments at year boundaries.
   */
  columns: readonly PhaseStripColumn[];
  /**
   * Resolved milestone list from `GET /api/projects/{id}/milestones`. Empty
   * or undefined → strip renders nothing (graceful degradation per spec).
   */
  milestones: readonly MilestoneResponse[];
}

/**
 * Strip renderer. Returns null when there are no milestones — the parent
 * grid then falls back to its v4/W2 column layout with no strip row.
 *
 * Exposed as a default export because it is rendered via `<PhaseStrip />`
 * inside the parent grid's `<TableHeader>` and never re-imported elsewhere.
 */
export function PhaseStrip({ columns, milestones }: PhaseStripProps) {
  const phaseMap = useMemo(() => {
    const dataKeys = columns
      .filter((c) => c.kind === 'data' && c.key != null)
      .map((c) => c.key as string);
    return mapColumnsToPhases(dataKeys, milestones);
  }, [columns, milestones]);

  const segments = useMemo(() => {
    const keys = columns.map((c) => (c.kind === 'data' ? c.key : null));
    return buildPhaseSegments(keys, phaseMap);
  }, [columns, phaseMap]);

  if (milestones.length === 0 || segments.length === 0) {
    return null;
  }

  return (
    <TableRow className="bg-muted/20 hover:bg-muted/20" data-slot="phase-strip-row">
      <TableHead
        className="sticky left-0 top-20 z-30 bg-muted/20 border-r border-border min-w-[220px] py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium"
      >
        Phase
      </TableHead>
      {renderSegmentCells(columns, segments)}
    </TableRow>
  );
}

/**
 * Walk the column list left-to-right and emit either a segment header
 * (with colSpan = segment.span) or a placeholder cell for columns that fall
 * outside every phase. Placeholder cells are still rendered so the column
 * count matches the parent header rows; they carry no fill.
 */
function renderSegmentCells(
  columns: readonly PhaseStripColumn[],
  segments: readonly PhaseSegment[],
): React.ReactNode[] {
  const cells: React.ReactNode[] = [];
  // Map from startIndex → segment for O(1) jump-skip during iteration.
  const segByStart = new Map<number, PhaseSegment>();
  for (const s of segments) segByStart.set(s.startIndex, s);

  let i = 0;
  while (i < columns.length) {
    const seg = segByStart.get(i);
    if (seg) {
      cells.push(<PhaseSegmentCell key={`seg-${seg.startKey}`} segment={seg} />);
      i += seg.span;
      continue;
    }
    const col = columns[i];
    cells.push(
      <TableHead
        key={`gap-${col.key ?? `yt-${i}`}`}
        className="sticky top-20 z-20 bg-muted/20 py-1"
      />,
    );
    i += 1;
  }
  return cells;
}

interface PhaseSegmentCellProps {
  segment: PhaseSegment;
}

/**
 * Single coloured strip segment. Uses `colSpan` so the segment block visually
 * spans every constituent column. Inside, an absolutely-positioned overlay
 * carries the slip-indicator triangle + line when `slipMonths` differs from
 * zero. The label is truncated with `truncate` and shows the full text via
 * Tooltip on hover (per spec).
 */
function PhaseSegmentCell({ segment }: PhaseSegmentCellProps) {
  const { phase, span } = segment;
  const fill = withAlpha(phase.color, 0.7);
  const slipIndicator = renderSlipIndicator(phase, span);

  return (
    <TableHead
      colSpan={span}
      className="sticky top-20 z-20 bg-muted/20 p-0 align-middle relative"
      style={{ minWidth: `${span * 90}px` }}
      data-phase-id={phase.phaseId}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative flex items-center justify-start h-5 px-2 mx-0.5 my-0.5 rounded-sm overflow-hidden cursor-help"
              style={{ backgroundColor: fill }}
            >
              <span className="text-[10px] font-semibold text-white truncate drop-shadow-sm">
                {phase.phaseName}
              </span>
              {slipIndicator}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="text-xs space-y-0.5">
              <div className="font-semibold">{phase.phaseName}</div>
              <div className="text-muted-foreground">
                Baseline ends {phase.baselineEnd}
              </div>
              <div className="text-muted-foreground">
                Forecast ends {phase.forecastEnd}
              </div>
              {phase.slipMonths > 0 && (
                <div className="text-red-400 font-medium">
                  +{phase.slipMonths} month{phase.slipMonths === 1 ? '' : 's'} slip
                </div>
              )}
              {phase.slipMonths < 0 && (
                <div className="text-emerald-400 font-medium">
                  {phase.slipMonths} month{phase.slipMonths === -1 ? '' : 's'} ahead
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableHead>
  );
}

/**
 * When the milestone slipped, position a small gray baseline marker on the
 * left edge of the segment with a thin red connecting line to the right-end
 * (forecast boundary). When there is no slip, render a single subtle gray
 * triangle marker on the right edge — this gives users a consistent visual
 * anchor for the baseline-end position regardless of slip state.
 *
 * Positioning is deliberately simple: the triangle sits at the trailing edge
 * for a no-slip phase, or at a position proportional to (span - slipMonths)
 * for a slipped phase. Quarter columns make pixel-accurate baseline marker
 * placement impossible without month-level introspection, so we fall back to
 * "right-edge of phase" anchoring which still communicates the slip
 * direction at a glance. Hover tooltip carries the precise dates.
 */
function renderSlipIndicator(phase: PhaseInfo, span: number): React.ReactNode {
  if (span <= 0) return null;
  if (phase.slipMonths > 0) {
    // Baseline triangle sits left of the trailing edge by `slipMonths` months
    // (clamped inside the segment). Red line connects baseline to actual.
    const slipFrac = Math.min(phase.slipMonths / Math.max(span, 1), 0.95);
    const baselineRight = `${slipFrac * 100}%`;
    return (
      <Fragment>
        {/* Connecting red slip line from baseline marker to the segment's
            trailing edge. Kept thin (1px) so it doesn't dominate. */}
        <span
          aria-hidden
          className="absolute top-0 h-1 bg-red-500/80 dark:bg-red-400/80"
          style={{ right: 0, width: baselineRight }}
        />
        {/* Gray triangle anchored at the baseline boundary. */}
        <span
          aria-hidden
          className="absolute -top-1.5 text-slate-500 dark:text-slate-300"
          style={{ right: baselineRight, transform: 'translateX(50%)' }}
        >
          <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden>
            <path d="M0 0 L8 0 L4 6 Z" fill="currentColor" />
          </svg>
        </span>
      </Fragment>
    );
  }
  // No slip — single gray triangle at the trailing edge.
  return (
    <span
      aria-hidden
      className="absolute -top-1.5 right-0 text-slate-500 dark:text-slate-300"
      style={{ transform: 'translateX(50%)' }}
    >
      <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden>
        <path d="M0 0 L8 0 L4 6 Z" fill="currentColor" />
      </svg>
    </span>
  );
}
