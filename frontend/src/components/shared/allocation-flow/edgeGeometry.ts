/**
 * Allocation Flow — pure edge geometry helpers.
 *
 * Bezier path construction, midpoint computation for labels, and the
 * sqrt-clamped stroke-width scale that drives "edge thickness scaled
 * proportionally to € amount" per `[AF-05]`. Pure — testable with
 * `node --test`.
 */
import type { FlowOrientation, PositionBox } from './layout';

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

/** Cubic Bezier coordinate at t=0.5 for a single axis. */
function bezierMid(s: number, c1: number, c2: number, e: number): number {
  return 0.125 * s + 0.375 * c1 + 0.375 * c2 + 0.125 * e;
}

/**
 * Build the Bezier between `src` and `dst`.
 *
 * Horizontal: anchors the right-edge midpoint of `src` to the left-edge
 * midpoint of `dst`, with control points offset by half the horizontal
 * distance — the gentle S-shape that reads cleanly across y rows.
 *
 * Vertical (§10.3 axis-swap): anchors the bottom-edge midpoint of `src`
 * to the top-edge midpoint of `dst`, with the control offset on Y. When
 * the depth distance is negative (inverse layout edge cases) the |delta|
 * is clamped to a small positive minimum so the curve never degenerates.
 */
export function computeEdgeGeometry(
  src: PositionBox,
  dst: PositionBox,
  orientation: FlowOrientation = 'horizontal',
): EdgeGeometry {
  let sx: number;
  let sy: number;
  let ex: number;
  let ey: number;
  let cp1x: number;
  let cp1y: number;
  let cp2x: number;
  let cp2y: number;

  if (orientation === 'vertical') {
    sx = src.x + src.w / 2;
    sy = src.y + src.h;
    ex = dst.x + dst.w / 2;
    ey = dst.y;
    const dy = Math.max(40, Math.abs(ey - sy) * 0.5);
    const dir = ey >= sy ? 1 : -1;
    cp1x = sx;
    cp1y = sy + dy * dir;
    cp2x = ex;
    cp2y = ey - dy * dir;
  } else {
    sx = src.x + src.w;
    sy = src.y + src.h / 2;
    ex = dst.x;
    ey = dst.y + dst.h / 2;
    const dx = Math.max(40, Math.abs(ex - sx) * 0.5);
    const dir = ex >= sx ? 1 : -1;
    cp1x = sx + dx * dir;
    cp1y = sy;
    cp2x = ex - dx * dir;
    cp2y = ey;
  }

  return {
    path: `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`,
    labelX: bezierMid(sx, cp1x, cp2x, ex),
    labelY: bezierMid(sy, cp1y, cp2y, ey),
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
