/**
 * Unit coverage for the reducer state mechanics behind the §7 debounced
 * cross-portfolio recompute. The 1s timer wiring itself is verified
 * behaviourally in visual verification; here we lock the deterministic
 * invariants the timer relies on:
 *   - each diff-changing mutation (MARK_STALE) bumps `mutationSeq` so the
 *     debounce effect re-runs and resets its timer;
 *   - a recompute (SET_IMPACT) / explicit CLEAR_STALE clears `stale` WITHOUT
 *     bumping `mutationSeq`, so it cannot re-trigger the auto-recompute.
 */
import { describe, expect, it, vi } from 'vitest';

// ScenarioContext transitively imports the API client (via RoleContext),
// which reads localStorage at module load — undefined in this project's node
// test env (no jsdom). Stub it before the import graph runs so the reducer
// can be imported and tested in isolation.
vi.hoisted(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }
});

import { reducer, initialState } from './ScenarioContext';
import type { ImpactDashboardResponse } from './api/scenariosApi';

describe('ScenarioContext reducer — debounce mechanics (§7)', () => {
  it('MARK_STALE sets stale and increments mutationSeq', () => {
    const s1 = reducer(initialState, { type: 'MARK_STALE' });
    expect(s1.stale).toBe(true);
    expect(s1.mutationSeq).toBe(1);

    const s2 = reducer(s1, { type: 'MARK_STALE' });
    expect(s2.stale).toBe(true);
    // Each edit advances the sequence so the debounce timer resets.
    expect(s2.mutationSeq).toBe(2);
  });

  it('SET_DETAIL with markStale bumps mutationSeq (the real overlay edit path)', () => {
    const detail = {} as never;
    // Overlay writes (cells/lines/plan/mix/external) dispatch SET_DETAIL
    // markStale:true — this MUST advance the debounce sequence.
    const edited = reducer(initialState, { type: 'SET_DETAIL', detail, markStale: true });
    expect(edited.stale).toBe(true);
    expect(edited.mutationSeq).toBe(1);
  });

  it('SET_DETAIL without markStale (a plain reload) does NOT bump mutationSeq', () => {
    const detail = {} as never;
    const reloaded = reducer(initialState, { type: 'SET_DETAIL', detail });
    expect(reloaded.mutationSeq).toBe(0);
  });

  it('CLEAR_STALE clears stale but does NOT bump mutationSeq', () => {
    const edited = reducer(initialState, { type: 'MARK_STALE' });
    const cleared = reducer(edited, { type: 'CLEAR_STALE' });
    expect(cleared.stale).toBe(false);
    // No bump → the schedule effect won't re-fire after a manual recalc.
    expect(cleared.mutationSeq).toBe(edited.mutationSeq);
  });

  it('SET_IMPACT adopts the server stale flag without bumping mutationSeq', () => {
    const edited = reducer(initialState, { type: 'MARK_STALE' });
    const impact = { stale: false } as ImpactDashboardResponse;
    const next = reducer(edited, { type: 'SET_IMPACT', impact });
    expect(next.impact).toBe(impact);
    expect(next.stale).toBe(false);
    expect(next.mutationSeq).toBe(edited.mutationSeq);
  });

  it('RESET returns mutationSeq to 0 so a scenario switch cannot trigger a stray recompute', () => {
    const edited = reducer(initialState, { type: 'MARK_STALE' });
    const reset = reducer(edited, { type: 'RESET' });
    expect(reset.stale).toBe(false);
    expect(reset.mutationSeq).toBe(0);
  });
});
