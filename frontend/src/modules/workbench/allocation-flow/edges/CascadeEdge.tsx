/**
 * CascadeEdge — single rendered edge in the Allocation Flow.
 *
 * Draws the cubic Bezier path produced by `computeEdgeGeometry`, a
 * small filled-circle arrowhead at the destination per `[AF-04]`, and
 * the EdgeLabelPill anchored at the t=0.5 midpoint. Stroke width is
 * driven by the sqrt-clamped scale relative to the largest visible
 * edge per `[AF-05]`. Stroke colour uses CSS custom properties so
 * dark mode + theme switches are automatic.
 */
import type { PositionBox } from '../layout';
import { computeEdgeGeometry, computeStrokeWidth } from '../edgeGeometry';
import { EdgeLabelPill } from './EdgeLabelPill';

export interface CascadeEdgeProps {
  src: PositionBox;
  dst: PositionBox;
  percentage: number;
  amount: number;
  maxAmount: number;
  emphasised?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ARROW_R = 4;

export function CascadeEdge({
  src,
  dst,
  percentage,
  amount,
  maxAmount,
  emphasised,
  onMouseEnter,
  onMouseLeave,
}: CascadeEdgeProps) {
  const g = computeEdgeGeometry(src, dst);
  const stroke = computeStrokeWidth(amount, maxAmount);
  // Pull the arrowhead in slightly so it doesn't collide with the
  // destination's left edge.
  const arrowX = g.endX - ARROW_R * 0.5;
  const arrowY = g.endY;

  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Wider hit area for hover — invisible, sits under the visible path. */}
      <path
        d={g.path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(14, stroke + 8)}
        style={{ cursor: 'pointer' }}
      />
      <path
        d={g.path}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{
          stroke: emphasised ? 'var(--primary)' : 'var(--border)',
          transition: 'stroke 120ms ease-out',
        }}
      />
      <circle
        cx={arrowX}
        cy={arrowY}
        r={ARROW_R}
        style={{
          fill: emphasised ? 'var(--primary)' : 'var(--muted-foreground)',
          transition: 'fill 120ms ease-out',
        }}
      />
      <EdgeLabelPill
        cx={g.labelX}
        cy={g.labelY}
        percentage={percentage}
        amount={amount}
        emphasised={emphasised}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    </g>
  );
}
