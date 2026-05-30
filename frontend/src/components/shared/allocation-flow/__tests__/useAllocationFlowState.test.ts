/**
 * Pure unit tests for the AllocationFlow reducer + initial-state
 * helpers. The reducer is pure — no React runtime needed.
 *
 * Run with:
 *   npm test
 */
import { describe, it, expect } from 'vitest';
import {
  initialState,
  reducer,
} from '../useAllocationFlowState.ts';

describe('initialState', () => {
  it('starts at depth ±1, full-chain off', () => {
    const s = initialState();
    expect(s.expandedDepthUp).toBe(1);
    expect(s.expandedDepthDown).toBe(1);
    expect(s.showFullChain).toBe(false);
    expect(s.hoverEdgeKey).toBe(null);
    expect(s.hoverNodeId).toBe(null);
    expect(s.selectedVersionId).toBe(null);
  });
});

describe('reducer', () => {
  it('expand_up bumps upstream depth and clears show_full_chain', () => {
    const s = { ...initialState(), showFullChain: true, expandedDepthUp: 5 };
    const next = reducer(s, { type: 'expand_up' });
    expect(next.expandedDepthUp).toBe(6);
    expect(next.showFullChain).toBe(false);
  });

  it('expand_down bumps downstream depth without touching upstream', () => {
    const s = initialState();
    const next = reducer(s, { type: 'expand_down' });
    expect(next.expandedDepthDown).toBe(2);
    expect(next.expandedDepthUp).toBe(1);
  });

  it('reset_depth returns to ±1 and clears hover', () => {
    const s = {
      ...initialState(),
      expandedDepthUp: 4,
      expandedDepthDown: 3,
      showFullChain: true,
      hoverEdgeKey: 'a→b',
      hoverNodeId: 'a',
    };
    const next = reducer(s, { type: 'reset_depth' });
    expect(next.expandedDepthUp).toBe(1);
    expect(next.expandedDepthDown).toBe(1);
    expect(next.showFullChain).toBe(false);
    expect(next.hoverEdgeKey).toBe(null);
    expect(next.hoverNodeId).toBe(null);
  });

  it('set_show_full_chain(true) turns on the flag and floods both depths', () => {
    const s = initialState();
    const next = reducer(s, { type: 'set_show_full_chain', value: true });
    expect(next.showFullChain).toBe(true);
    expect(next.expandedDepthUp).toBeGreaterThan(10);
    expect(next.expandedDepthDown).toBeGreaterThan(10);
  });

  it('set_show_full_chain(false) collapses back to ±1', () => {
    const s = {
      ...initialState(),
      showFullChain: true,
      expandedDepthUp: 99,
      expandedDepthDown: 99,
    };
    const next = reducer(s, { type: 'set_show_full_chain', value: false });
    expect(next.showFullChain).toBe(false);
    expect(next.expandedDepthUp).toBe(1);
    expect(next.expandedDepthDown).toBe(1);
  });

  it('hover actions: identity short-circuit (no new object when key unchanged)', () => {
    const s = { ...initialState(), hoverEdgeKey: 'a→b' };
    const next = reducer(s, { type: 'set_hover_edge', key: 'a→b' });
    // Same reference — prevents wasted re-renders on every mousemove.
    expect(next).toBe(s);
  });

  it('toggle_legend flips the open flag', () => {
    const s = initialState();
    const next = reducer(s, { type: 'toggle_legend' });
    expect(next.legendOpen).toBe(!s.legendOpen);
  });

  it('set_version stores the selected DistributionVersion id', () => {
    const s = initialState();
    const next = reducer(s, { type: 'set_version', id: 42 });
    expect(next.selectedVersionId).toBe(42);
  });
});
