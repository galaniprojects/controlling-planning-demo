/**
 * Pure unit tests for edgeGeometry helpers.
 *
 * Run locally with:
 *   npm test
 */
import { describe, it, expect } from 'vitest';
import {
  computeEdgeGeometry,
  computeStrokeWidth,
  edgeKey,
  MAX_STROKE,
  MIN_STROKE,
} from '../edgeGeometry.ts';

describe('computeStrokeWidth', () => {
  it('returns MIN_STROKE when maxAmount is zero', () => {
    expect(computeStrokeWidth(0, 0)).toBe(MIN_STROKE);
    expect(computeStrokeWidth(100, 0)).toBe(MIN_STROKE);
  });

  it('returns MIN_STROKE at zero amount', () => {
    expect(computeStrokeWidth(0, 100)).toBe(MIN_STROKE);
  });

  // N-3 (Wave C, deferred from Wave B review): explicit named test for the
  // amount-is-zero edge case at a non-zero maxAmount. The pre-existing
  // "zero amount" test above duplicates the contract; this one pins it to
  // an exact signature reviewers can grep for.
  it('returns MIN_STROKE when amount is 0', () => {
    expect(computeStrokeWidth(0, 50)).toBe(MIN_STROKE);
  });

  it('returns MAX_STROKE at amount=maxAmount', () => {
    expect(computeStrokeWidth(100, 100)).toBe(MAX_STROKE);
  });

  it('clamps below MIN_STROKE for negative amounts', () => {
    expect(computeStrokeWidth(-5, 100)).toBe(MIN_STROKE);
  });

  it('never exceeds MAX_STROKE even when ratio > 1', () => {
    expect(computeStrokeWidth(200, 100)).toBe(MAX_STROKE);
  });

  it('scales sqrt-monotonically', () => {
    // sqrt is concave → strokes climb fast then flatten.
    const a = computeStrokeWidth(25, 100);
    const b = computeStrokeWidth(50, 100);
    const c = computeStrokeWidth(75, 100);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // sqrt(0.25) = 0.5 → 1.5 + 3.25 = 4.75
    expect(a).toBe(4.75);
  });

  it('returns MIN_STROKE for NaN inputs', () => {
    expect(computeStrokeWidth(NaN, 100)).toBe(MIN_STROKE);
    expect(computeStrokeWidth(50, NaN)).toBe(MIN_STROKE);
  });
});

describe('computeEdgeGeometry', () => {
  it('builds a cubic Bezier from src right-mid to dst left-mid', () => {
    const g = computeEdgeGeometry(
      { x: 0, y: 0, w: 200, h: 100 },
      { x: 400, y: 200, w: 200, h: 100 },
    );
    // src right-mid = (200, 50); dst left-mid = (400, 250)
    expect(g.path.startsWith('M 200 50 C ')).toBe(true);
    expect(g.path.endsWith('400 250')).toBe(true);
    expect(g.endX).toBe(400);
    expect(g.endY).toBe(250);
  });

  it('places label midpoint between src and dst', () => {
    const g = computeEdgeGeometry(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 500, y: 0, w: 100, h: 100 },
    );
    // Symmetric layout: midpoint x is halfway between sx=100 and ex=500.
    expect(g.labelX).toBe(300);
    expect(g.labelY).toBe(50);
  });

  it('handles overlapping x (defensive clamp) without NaN', () => {
    // src and dst start at the same x — shouldn't NaN.
    const g = computeEdgeGeometry(
      { x: 100, y: 0, w: 200, h: 100 },
      { x: 100, y: 300, w: 200, h: 100 },
    );
    expect(Number.isFinite(g.labelX)).toBe(true);
    expect(Number.isFinite(g.labelY)).toBe(true);
  });
});

describe('edgeKey', () => {
  it('produces a stable arrow-formatted concatenation', () => {
    expect(edgeKey('a', 'b')).toBe('a→b');
    expect(edgeKey('a', 'b')).not.toBe(edgeKey('b', 'a'));
  });
});
