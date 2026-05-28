/**
 * Unit tests for `buildMutationPlan` — runnable under Vitest once the
 * integration step adds the `vitest` devDependency. The declarations
 * below are local shims so `tsc --noEmit` stays clean in the meantime.
 */

// Local Vitest shims — replace with `import { describe, it, expect } from 'vitest';`
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
interface Expectation<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
}
declare function expect<T>(actual: T): Expectation<T>;

import {
  buildMutationPlan,
  planIsDirty,
  type PendingRowDiffInput,
  type ServerEdgeSnapshot,
} from './pendingDiff';

const snap = (overrides: Partial<ServerEdgeSnapshot> & { id: number }): ServerEdgeSnapshot => ({
  destinationId: 'd',
  percentage: 0,
  rationale: '',
  ...overrides,
});

const row = (overrides: Partial<PendingRowDiffInput> & { key: string }): PendingRowDiffInput => ({
  edgeId: null,
  destinationId: 'd',
  percentage: 0,
  rationale: '',
  isNew: false,
  isDeleted: false,
  ...overrides,
});

describe('buildMutationPlan', () => {
  it('returns an empty plan for an unchanged form', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 1, percentage: 25 })],
      pendingRows: [row({ key: 'edge-1', edgeId: 1, percentage: 25 })],
      serverToBusinessPct: 10,
      pendingToBusinessPct: 10,
    });
    expect(plan.mutations.length).toBe(0);
    expect(plan.toBusinessPct).toBe(null);
    expect(planIsDirty(plan)).toBe(false);
  });

  it('emits a delete for soft-deleted existing rows', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 7, percentage: 30 })],
      pendingRows: [
        row({ key: 'edge-7', edgeId: 7, percentage: 30, isDeleted: true }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations).toEqual([{ kind: 'delete', edgeId: 7 }]);
  });

  it('emits an update when percentage changes', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 7, percentage: 30, rationale: 'r' })],
      pendingRows: [
        row({ key: 'edge-7', edgeId: 7, percentage: 45, rationale: 'r' }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations).toEqual([
      { kind: 'update', edgeId: 7, percentage: 45, rationale: 'r' },
    ]);
  });

  it('emits an update when rationale changes (whitespace-trim)', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 7, percentage: 30, rationale: 'old' })],
      pendingRows: [
        row({ key: 'edge-7', edgeId: 7, percentage: 30, rationale: '  new  ' }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations).toEqual([
      { kind: 'update', edgeId: 7, percentage: 30, rationale: 'new' },
    ]);
  });

  it('does not emit an update for whitespace-only rationale change', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 7, percentage: 30, rationale: 'r' })],
      pendingRows: [
        row({ key: 'edge-7', edgeId: 7, percentage: 30, rationale: '  r  ' }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations.length).toBe(0);
  });

  it('emits a create for new rows', () => {
    const plan = buildMutationPlan({
      serverEdges: [],
      pendingRows: [
        row({ key: 'new-0', destinationId: 'X', percentage: 12.5, isNew: true, rationale: 'why' }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations).toEqual([
      { kind: 'create', destinationId: 'X', percentage: 12.5, rationale: 'why' },
    ]);
  });

  it('omits new+deleted rows entirely', () => {
    const plan = buildMutationPlan({
      serverEdges: [],
      pendingRows: [
        row({ key: 'new-0', destinationId: 'X', percentage: 1, isNew: true, isDeleted: true }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations.length).toBe(0);
  });

  it('sequences deletes → updates → creates', () => {
    const plan = buildMutationPlan({
      serverEdges: [
        snap({ id: 1, percentage: 10 }),
        snap({ id: 2, percentage: 20 }),
      ],
      pendingRows: [
        row({ key: 'edge-1', edgeId: 1, percentage: 10, isDeleted: true }),
        row({ key: 'edge-2', edgeId: 2, percentage: 25 }),
        row({ key: 'new-0', destinationId: 'Z', percentage: 5, isNew: true }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations.map((m) => m.kind)).toEqual(['delete', 'update', 'create']);
  });

  it('emits a toBusinessPct write when changed', () => {
    const plan = buildMutationPlan({
      serverEdges: [],
      pendingRows: [],
      serverToBusinessPct: 10,
      pendingToBusinessPct: 12.5,
    });
    expect(plan.toBusinessPct).toBe(12.5);
    expect(planIsDirty(plan)).toBe(true);
  });

  it('treats tiny float deltas as unchanged', () => {
    const plan = buildMutationPlan({
      serverEdges: [snap({ id: 1, percentage: 10 })],
      pendingRows: [
        row({ key: 'edge-1', edgeId: 1, percentage: 10.00001 }),
      ],
      serverToBusinessPct: 5,
      pendingToBusinessPct: 5.00001,
    });
    expect(plan.mutations.length).toBe(0);
    expect(plan.toBusinessPct).toBe(null);
  });

  it('skips pending rows whose edgeId no longer exists on the server', () => {
    const plan = buildMutationPlan({
      serverEdges: [],
      pendingRows: [
        row({ key: 'edge-99', edgeId: 99, percentage: 50 }),
      ],
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });
    expect(plan.mutations.length).toBe(0);
  });
});
