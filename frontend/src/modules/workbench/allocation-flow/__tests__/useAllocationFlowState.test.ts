/**
 * Pure unit tests for the AllocationFlow reducer + initial-state
 * helpers. The reducer is pure — no React runtime needed.
 *
 * Run with:
 *   node --experimental-strip-types --test \
 *     src/modules/workbench/allocation-flow/__tests__/useAllocationFlowState.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  reducer,
} from '../useAllocationFlowState.ts';

test('initialState: starts at depth ±1, full-chain off', () => {
  const s = initialState();
  assert.equal(s.expandedDepthUp, 1);
  assert.equal(s.expandedDepthDown, 1);
  assert.equal(s.showFullChain, false);
  assert.equal(s.hoverEdgeKey, null);
  assert.equal(s.hoverNodeId, null);
  assert.equal(s.selectedVersionId, null);
});

test('expand_up: bumps upstream depth and clears show_full_chain', () => {
  const s = { ...initialState(), showFullChain: true, expandedDepthUp: 5 };
  const next = reducer(s, { type: 'expand_up' });
  assert.equal(next.expandedDepthUp, 6);
  assert.equal(next.showFullChain, false);
});

test('expand_down: bumps downstream depth without touching upstream', () => {
  const s = initialState();
  const next = reducer(s, { type: 'expand_down' });
  assert.equal(next.expandedDepthDown, 2);
  assert.equal(next.expandedDepthUp, 1);
});

test('reset_depth: returns to ±1 and clears hover', () => {
  const s = {
    ...initialState(),
    expandedDepthUp: 4,
    expandedDepthDown: 3,
    showFullChain: true,
    hoverEdgeKey: 'a→b',
    hoverNodeId: 'a',
  };
  const next = reducer(s, { type: 'reset_depth' });
  assert.equal(next.expandedDepthUp, 1);
  assert.equal(next.expandedDepthDown, 1);
  assert.equal(next.showFullChain, false);
  assert.equal(next.hoverEdgeKey, null);
  assert.equal(next.hoverNodeId, null);
});

test('set_show_full_chain(true): turns on the flag and floods both depths', () => {
  const s = initialState();
  const next = reducer(s, { type: 'set_show_full_chain', value: true });
  assert.equal(next.showFullChain, true);
  assert.ok(next.expandedDepthUp > 10);
  assert.ok(next.expandedDepthDown > 10);
});

test('set_show_full_chain(false): collapses back to ±1', () => {
  const s = {
    ...initialState(),
    showFullChain: true,
    expandedDepthUp: 99,
    expandedDepthDown: 99,
  };
  const next = reducer(s, { type: 'set_show_full_chain', value: false });
  assert.equal(next.showFullChain, false);
  assert.equal(next.expandedDepthUp, 1);
  assert.equal(next.expandedDepthDown, 1);
});

test('hover actions: identity short-circuit (no new object when key unchanged)', () => {
  const s = { ...initialState(), hoverEdgeKey: 'a→b' };
  const next = reducer(s, { type: 'set_hover_edge', key: 'a→b' });
  // Same reference — prevents wasted re-renders on every mousemove.
  assert.strictEqual(next, s);
});

test('toggle_legend: flips the open flag', () => {
  const s = initialState();
  const next = reducer(s, { type: 'toggle_legend' });
  assert.equal(next.legendOpen, !s.legendOpen);
});

test('set_version: stores the selected DistributionVersion id', () => {
  const s = initialState();
  const next = reducer(s, { type: 'set_version', id: 42 });
  assert.equal(next.selectedVersionId, 42);
});
