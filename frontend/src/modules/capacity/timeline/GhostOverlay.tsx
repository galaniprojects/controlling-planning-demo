/**
 * GhostOverlay — v5.2 W5 Track A (S6b, spec §9.4 + §9.6 + §9.8).
 *
 * Renders a single dashed-border block on top of a timeline bar cell to
 * preview an assignment that hasn't been committed. Two variants:
 *
 *   - `kind:'ghost'`   → dashed border, semi-transparent fill in the
 *                         project's color. Click → assigns the person.
 *   - `kind:'session'` → solid border, full opacity. Click → reverts to
 *                         a ghost (§9.6 "Undo").
 *
 * The component is dumb: it receives a single `GhostSegment` plus the
 * position of the bar inside its cell, and emits a click event. The
 * data layer (ghostOverlay.ts + useAssignmentOverlay.ts) decides which
 * ghost to show in a given cell; this file owns only the visuals.
 *
 * Visual rules (§9.4):
 *   - Width:      `(hours / standardHours) * 100%` of the bar's width
 *                 (capped at 200% so over-allocation still renders).
 *   - Position:   sits on top of the bar's idle gap — left edge starts
 *                 at the person's current utilization%, extending right.
 *   - Fill:       project color at 30% (matching) or 15% (other) opacity.
 *   - Border:     1.5px (matching) / 1px (other) dashed in project color.
 *   - Overrides:
 *       red        → over-allocation preview (§9.4)
 *       blue       → CR-direction 'increase' (§9.8)
 *       orange     → CR-direction 'decrease' (§9.8)
 *
 * Tooltip text (§9.6) — `"{Project Name} — {Role}: {hours}h"`.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';
import type { GhostSegment } from './ghostOverlay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Border palette — keep these in lockstep with §9.4 / §9.8. */
const BORDER_RED = '#dc2626';
const BORDER_BLUE = '#2563eb';
const BORDER_ORANGE = '#ea580c';

/** Maximum bar overflow shown in the cell (matches SegmentBar's clamp). */
const MAX_GHOST_WIDTH_PCT = 200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GhostOverlayProps {
  ghost: GhostSegment;
  /** Optional context label for the tooltip — typically the month label. */
  monthLabel: string;
  /** Click handler — receives the same ghost back so the parent can dispatch. */
  onClick: (ghost: GhostSegment) => void;
}

export function GhostOverlay({ ghost, monthLabel, onClick }: GhostOverlayProps) {
  const projectColor = useProjectColor(ghost.projectId);
  const isSession = ghost.kind === 'session';

  // ---- Geometry ----------------------------------------------------------
  // The bar is a 100%-wide track inside a fixed-width cell. The ghost
  // overlays the right side of the bar starting at the person's current
  // utilization.
  const std = ghost.standardHours > 0 ? ghost.standardHours : 1;
  const startPct = std > 0 ? (ghost.currentAllocatedHours / std) * 100 : 0;
  const widthPct = Math.min(
    MAX_GHOST_WIDTH_PCT,
    Math.max(2, (ghost.hours / std) * 100),
  );
  // Clamp left so the ghost stays inside the bar even when the person is
  // already at 100% — the visible portion shrinks but a thin sliver still
  // surfaces (combined with the red border this is exactly the §9.4
  // over-allocation cue).
  const left = Math.min(98, Math.max(0, startPct));

  // ---- Border colour -----------------------------------------------------
  let borderColor = projectColor;
  if (ghost.willOverAllocate) borderColor = BORDER_RED;
  else if (ghost.changeDirection === 'increase') borderColor = BORDER_BLUE;
  else if (ghost.changeDirection === 'decrease') borderColor = BORDER_ORANGE;

  // ---- Fill / opacity ----------------------------------------------------
  const fillOpacity = isSession
    ? 1
    : ghost.isMatchingRole
      ? 0.3
      : 0.15;
  const borderWidth = isSession
    ? 1.5
    : ghost.isMatchingRole
      ? 1.5
      : 1;
  const borderStyle = isSession ? 'solid' : 'dashed';

  // ---- Render ------------------------------------------------------------
  const tooltipDirection =
    ghost.changeDirection === 'increase'
      ? ' (increase)'
      : ghost.changeDirection === 'decrease'
        ? ' (decrease)'
        : '';
  const tooltipText = `${ghost.projectName} — ${ghost.roleLabel}: ${ghost.hours.toFixed(0)}h${tooltipDirection}`;
  const ariaLabel = isSession
    ? `Click to undo: ${tooltipText}`
    : `Click to assign: ${tooltipText}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            // Prevent the row-level click handler from firing (which
            // would open the person-detail panel and clobber the
            // assignment session's panel content).
            e.stopPropagation();
            onClick(ghost);
          }}
          aria-label={ariaLabel}
          className={cn(
            'absolute top-0 bottom-0 cursor-pointer rounded-[2px]',
            'transition-transform hover:scale-[1.02]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          )}
          style={{
            left: `${left}%`,
            width: `${widthPct}%`,
            backgroundColor: projectColor,
            opacity: fillOpacity,
            border: `${borderWidth}px ${borderStyle} ${borderColor}`,
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">{ghost.projectName}</div>
        <div className="text-[11px] opacity-90">
          {monthLabel} — {ghost.roleLabel}: {ghost.hours.toFixed(0)}h
          {ghost.willOverAllocate ? ' · over-allocates' : ''}
          {ghost.changeDirection === 'increase' ? ' · CR increase' : ''}
          {ghost.changeDirection === 'decrease' ? ' · CR decrease' : ''}
        </div>
        <div className="text-[10px] opacity-75">
          {isSession
            ? 'Click to undo this assignment'
            : 'Click to assign for the full remaining hours'}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
