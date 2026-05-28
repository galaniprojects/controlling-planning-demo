/**
 * Pure unit tests for edgeGeometry helpers.
 *
 * Run locally with:
 *   node --experimental-strip-types --test \
 *     src/modules/workbench/allocation-flow/__tests__/edgeGeometry.test.ts
 *
 * (Vitest is not in the project's devDeps in this sandbox; node's
 * built-in test runner provides the same coverage for pure functions.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEdgeGeometry,
  computeStrokeWidth,
  edgeKey,
  MAX_STROKE,
  MIN_STROKE,
} from '../edgeGeometry.ts';

test('computeStrokeWidth: returns MIN_STROKE when maxAmount is zero', () => {
  assert.equal(computeStrokeWidth(0, 0), MIN_STROKE);
  assert.equal(computeStrokeWidth(100, 0), MIN_STROKE);
});

test('computeStrokeWidth: returns MIN_STROKE at zero amount', () => {
  assert.equal(computeStrokeWidth(0, 100), MIN_STROKE);
});

test('computeStrokeWidth: returns MAX_STROKE at amount=maxAmount', () => {
  assert.equal(computeStrokeWidth(100, 100), MAX_STROKE);
});

test('computeStrokeWidth: clamps below MIN_STROKE for negative amounts', () => {
  assert.equal(computeStrokeWidth(-5, 100), MIN_STROKE);
});

test('computeStrokeWidth: never exceeds MAX_STROKE even when ratio > 1', () => {
  assert.equal(computeStrokeWidth(200, 100), MAX_STROKE);
});

test('computeStrokeWidth: scales sqrt-monotonically', () => {
  // sqrt is concave → strokes climb fast then flatten.
  const a = computeStrokeWidth(25, 100);
  const b = computeStrokeWidth(50, 100);
  const c = computeStrokeWidth(75, 100);
  assert.ok(a < b);
  assert.ok(b < c);
  // sqrt(0.25) = 0.5 → 1.5 + 3.25 = 4.75
  assert.equal(a, 4.75);
});

test('computeStrokeWidth: NaN inputs return MIN_STROKE', () => {
  assert.equal(computeStrokeWidth(NaN, 100), MIN_STROKE);
  assert.equal(computeStrokeWidth(50, NaN), MIN_STROKE);
});

test('computeEdgeGeometry: builds a cubic Bezier from src right-mid to dst left-mid', () => {
  const g = computeEdgeGeometry(
    { x: 0, y: 0, w: 200, h: 100 },
    { x: 400, y: 200, w: 200, h: 100 },
  );
  // src right-mid = (200, 50); dst left-mid = (400, 250)
  assert.ok(g.path.startsWith('M 200 50 C '));
  assert.ok(g.path.endsWith('400 250'));
  assert.equal(g.endX, 400);
  assert.equal(g.endY, 250);
});

test('computeEdgeGeometry: label midpoint sits between src and dst', () => {
  const g = computeEdgeGeometry(
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 500, y: 0, w: 100, h: 100 },
  );
  // Symmetric layout: midpoint x is halfway between sx=100 and ex=500.
  assert.equal(g.labelX, 300);
  assert.equal(g.labelY, 50);
});

test('computeEdgeGeometry: handles overlapping x (defensive clamp)', () => {
  // src and dst start at the same x — shouldn't NaN.
  const g = computeEdgeGeometry(
    { x: 100, y: 0, w: 200, h: 100 },
    { x: 100, y: 300, w: 200, h: 100 },
  );
  assert.ok(Number.isFinite(g.labelX));
  assert.ok(Number.isFinite(g.labelY));
});

test('edgeKey: stable arrow-formatted concatenation', () => {
  assert.equal(edgeKey('a', 'b'), 'a→b');
  assert.notEqual(edgeKey('a', 'b'), edgeKey('b', 'a'));
});
