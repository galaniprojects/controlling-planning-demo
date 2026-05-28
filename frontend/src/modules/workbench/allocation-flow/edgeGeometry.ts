/**
 * Allocation Flow — pure edge geometry helpers.
 *
 * Bezier path construction, midpoint computation for labels, and the
 * sqrt-clamped stroke-width scale that drives "edge thickness scaled
 * proportionally to € amount" per `[AF-05]`. Pure — testable with
 * `node --test`.
 */
import type { PositionBox } from './layout';

export const MIN_STROKE = 1.5;
export const MAX_STROKE = 8;
export const STROKE_GAIN = 6.5;

export interface EdgeGeometry {
  /** SVG path `d` attribute — a cubic Bezier from src right-mid to dst left-mid. */
  path: string;
  /** Point on the curve at t=0.5 — where the label pill anchors. */
  labelX: number;
  labelY: number;
  /** Endpoint of the curve — where the arrowhead circle sits. */
  endX: number;
  endY: number;
}

/**
 * Build the Bezier from the right-edge midpoint of `src` to the
 * left-edge midpoint of `dst`. Control points are offset by half the
 * horizontal distance on either end, producing the gentle S-shape
 * that reads cleanly even when nodes straddle different y rows.
 */
export function computeEdgeGeometry(src: PositionBox, dst: PositionBox): EdgeGeometry {
  const sx = src.x + src.w;
  const sy = src.y + src.h / 2;
  const ex = dst.x;
  const ey = dst.y + dst.h / 2;

  // Horizontal half-offset for control points. When the horizontal
  // distance is negative (e.g. focal → upstream during inverse layout
  // edge cases) we still want a sensible curve, so we clamp |dx| to a
  // small positive minimum.
  const dx = Math.max(40, Math.abs(ex - sx) * 0.5);
  const dir = ex >= sx ? 1 : -1;
  const cp1x = sx + dx * dir;
  const cp1y = sy;
  const cp2x = ex - dx * dir;
  const cp2y = ey;

  // Cubic Bezier point at t=0.5.
  const t = 0.5;
  const mt = 1 - t;
  const labelX =
    mt * mt * mt * sx +
    3 * mt * mt * t * cp1x +
    3 * mt * t * t * cp2x +
    t * t * t * ex;
  const labelY =
    mt * mt * mt * sy +
    3 * mt * mt * t * cp1y +
    3 * mt * t * t * cp2y +
    t * t * t * ey;

  return {
    path: `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`,
    labelX,
    labelY,
    endX: ex,
    endY: ey,
  };
}

/**
 * Sqrt-clamped stroke-width per `[AF-05]`: thickness ~ √(amount /
 * maxAmount) so the most expensive edge is visually distinguishable
 * without rendering tiny edges as hairlines. Clamped to [1.5, 8] px.
 *
 *  - `amount = 0` or `maxAmount = 0` → minimum stroke (avoids NaN).
 *  - `amount = maxAmount` → 1.5 + 6.5 = 8 (top of the scale).
 */
export function computeStrokeWidth(amount: number, maxAmount: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxAmount) || maxAmount <= 0) {
    return MIN_STROKE;
  }
  const ratio = Math.max(0, Math.min(1, amount / maxAmount));
  const raw = MIN_STROKE + Math.sqrt(ratio) * STROKE_GAIN;
  return Math.min(MAX_STROKE, Math.max(MIN_STROKE, raw));
}

/** Stable key for hover identification — `<srcId>→<dstId>`. */
export function edgeKey(src: string, dst: string): string {
  return `${src}→${dst}`;
}
