/**
 * Integration test exercising `pendingFromCascade` + `editorReducer` +
 * `buildMutationPlan` end-to-end. Closes the gap that masked the
 * Wave B blocker (B-1/B-2): unit tests on `buildMutationPlan` alone
 * fed hand-written `PendingRowDiffInput` with positive edge ids; the
 * production seeding path (`pendingFromCascade`) was never exercised
 * against the diff planner, so the dropped `edgeId: -1` sentinel that
 * caused all existing-row edits to no-op never tripped a test.
 */
import { describe, it, expect } from 'vitest';
import type {
  CascadeChainResponse,
  DistributionVersionResponse,
} from '@/types/api';
import {
  editorReducer,
  initialEditorState,
  pendingFromCascade,
  type EditorAction,
} from './state';
import { buildMutationPlan } from '../helpers/pendingDiff';

const FAKE_VERSION: DistributionVersionResponse = {
  id: 7,
  status: 'draft',
  active_from: null,
  activated_at: null,
  origin: 'copy_active',
  copied_from_version_id: 1,
  rationale: null,
  scenario_id: null,
  created_at: '2026-05-28T00:00:00Z',
  created_by: 'anna',
};

function makeCascade(
  outgoing: Array<{ destId: string; pct: number; rationale?: string }>,
): CascadeChainResponse {
  return {
    focal: {
      entity_id: 'svc-focal',
      entity_name: 'Focal',
      entity_type: 'InternalService',
      identifier: 'ITF99001',
      own_cost: 100,
      effective_cost: 100,
      to_business_pct: 0,
      self_retained_pct: 100 - outgoing.reduce((s, e) => s + e.pct, 0),
    },
    upstream: [],
    downstream: outgoing.map((e, i) => ({
      entity_id: e.destId,
      entity_name: `Dest ${i}`,
      entity_type: 'Offering',
      identifier: `DEST-${i}`,
      own_cost: 0,
      effective_cost: 0,
      to_business_pct: 0,
      self_retained_pct: 0,
    })),
    edges: outgoing.map((e) => ({
      source_entity_id: 'svc-focal',
      destination_entity_id: e.destId,
      percentage: e.pct,
      amount: (100 * e.pct) / 100,
      chain_depth: 1,
      rationale: e.rationale ?? null,
    })),
    business_terminals: [],
    version: FAKE_VERSION,
    evaluated_date: '2026-05-28',
    max_allocation_depth: 6,
  };
}

describe('pendingFromCascade + reducer + buildMutationPlan (B-1/B-2/B-3 regression)', () => {
  it('stamps real edge ids on loaded rows when the summary map is supplied', () => {
    const cascade = makeCascade([
      { destId: 'off-a', pct: 50 },
      { destId: 'off-b', pct: 30 },
    ]);
    const lookup = new Map([
      ['off-a', 101],
      ['off-b', 202],
    ]);
    const pending = pendingFromCascade(cascade, lookup);
    expect(pending.rows.length).toBe(2);
    expect(pending.rows[0]?.edgeId).toBe(101);
    expect(pending.rows[0]?.key).toBe('edge-101');
    expect(pending.rows[1]?.edgeId).toBe(202);
    expect(pending.rows[1]?.key).toBe('edge-202');
  });

  it('falls back to destinationId-keyed slot when the summary map is empty (mid-flight load)', () => {
    const cascade = makeCascade([
      { destId: 'off-a', pct: 50 },
      { destId: 'off-b', pct: 30 },
    ]);
    const pending = pendingFromCascade(cascade, new Map());
    // No collision on a single `edge--1` slot — every row gets a unique
    // key derived from its destination. This is the bug the previous
    // `edge--1` sentinel introduced.
    expect(pending.rows[0]?.key).toBe('edge-dest-off-a');
    expect(pending.rows[1]?.key).toBe('edge-dest-off-b');
    expect(pending.rows[0]?.key).not.toBe(pending.rows[1]?.key);
    expect(pending.rows[0]?.edgeId).toBe(null);
    expect(pending.rows[1]?.edgeId).toBe(null);
  });

  it('end-to-end: cascade → reducer LOAD_OK → SET_ROW_PCT → buildMutationPlan emits the update', () => {
    const cascade = makeCascade([
      { destId: 'off-a', pct: 50, rationale: 'Anchor share' },
      { destId: 'off-b', pct: 30, rationale: 'Secondary' },
    ]);
    const lookup = new Map([
      ['off-a', 101],
      ['off-b', 202],
    ]);

    const loadAction: EditorAction = {
      type: 'LOAD_OK',
      cascade,
      entity: {
        id: 'svc-focal',
        identifier: 'ITF99001',
        name: 'Focal',
        entity_type: 'InternalService',
        run_change: 'run',
        own_cost: 100,
        to_business_pct: 0,
        is_active: true,
        responsible_user_id: null,
        annual_cost: 100,
        allocation_key: null,
        grouping_entity_id: null,
      },
      versions: [FAKE_VERSION],
      inForceVersionId: null,
      edgeIdByDestId: lookup,
    };
    const loaded = editorReducer(initialEditorState, loadAction);

    expect(loaded.pending.rows[0]?.edgeId).toBe(101);
    expect(loaded.pending.rows[1]?.edgeId).toBe(202);

    // User edits off-a to 60% using the row's key
    const key = loaded.pending.rows[0]!.key;
    expect(key).toBe('edge-101');
    const edited = editorReducer(loaded, {
      type: 'SET_ROW_PCT',
      key,
      value: 60,
    });
    expect(edited.pending.rows[0]?.percentage).toBe(60);
    expect(edited.pending.rows[1]?.percentage).toBe(30); // unchanged

    // Run through the diff planner exactly like the editor's mutationPlan
    // useMemo. Critically, off-a's update must surface — pre-fix the
    // `-1` sentinel + the `r.edgeId !== null` short-circuit dropped it.
    const plan = buildMutationPlan({
      serverEdges: cascade.edges.map((e) => ({
        id: lookup.get(e.destination_entity_id)!,
        destinationId: e.destination_entity_id,
        percentage: e.percentage,
        rationale: e.rationale ?? '',
      })),
      pendingRows: edited.pending.rows.map((r) => ({
        key: r.key,
        edgeId: r.edgeId,
        destinationId: r.destinationId,
        percentage: r.percentage,
        rationale: r.rationale,
        isNew: r.isNew,
        isDeleted: r.isDeleted,
      })),
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });

    expect(plan.mutations).toEqual([
      { kind: 'update', edgeId: 101, percentage: 60, rationale: 'Anchor share' },
    ]);
  });

  it('end-to-end: DELETE_ROW on a loaded row emits the delete mutation', () => {
    const cascade = makeCascade([{ destId: 'off-a', pct: 50 }]);
    const lookup = new Map([['off-a', 101]]);
    const loaded = editorReducer(initialEditorState, {
      type: 'LOAD_OK',
      cascade,
      entity: {
        id: 'svc-focal',
        identifier: 'ITF99001',
        name: 'Focal',
        entity_type: 'InternalService',
        run_change: 'run',
        own_cost: 100,
        to_business_pct: 0,
        is_active: true,
        responsible_user_id: null,
        annual_cost: 100,
        allocation_key: null,
        grouping_entity_id: null,
      },
      versions: [FAKE_VERSION],
      inForceVersionId: null,
      edgeIdByDestId: lookup,
    });

    const key = loaded.pending.rows[0]!.key;
    const afterDelete = editorReducer(loaded, { type: 'DELETE_ROW', key });

    // Soft-deleted row stays in pending.rows with isDeleted=true so the
    // mutation planner can emit the delete.
    expect(afterDelete.pending.rows.length).toBe(1);
    expect(afterDelete.pending.rows[0]?.isDeleted).toBe(true);

    const plan = buildMutationPlan({
      serverEdges: [
        {
          id: 101,
          destinationId: 'off-a',
          percentage: 50,
          rationale: '',
        },
      ],
      pendingRows: afterDelete.pending.rows.map((r) => ({
        key: r.key,
        edgeId: r.edgeId,
        destinationId: r.destinationId,
        percentage: r.percentage,
        rationale: r.rationale,
        isNew: r.isNew,
        isDeleted: r.isDeleted,
      })),
      serverToBusinessPct: 0,
      pendingToBusinessPct: 0,
    });

    expect(plan.mutations).toEqual([{ kind: 'delete', edgeId: 101 }]);
  });

  it('end-to-end: DISCARD re-seeds pending from cascade + stored edgeIdByDestId', () => {
    const cascade = makeCascade([{ destId: 'off-a', pct: 50 }]);
    const lookup = new Map([['off-a', 101]]);
    const loaded = editorReducer(initialEditorState, {
      type: 'LOAD_OK',
      cascade,
      entity: {
        id: 'svc-focal',
        identifier: 'ITF99001',
        name: 'Focal',
        entity_type: 'InternalService',
        run_change: 'run',
        own_cost: 100,
        to_business_pct: 0,
        is_active: true,
        responsible_user_id: null,
        annual_cost: 100,
        allocation_key: null,
        grouping_entity_id: null,
      },
      versions: [FAKE_VERSION],
      inForceVersionId: null,
      edgeIdByDestId: lookup,
    });

    const edited = editorReducer(loaded, {
      type: 'SET_ROW_PCT',
      key: 'edge-101',
      value: 80,
    });
    expect(edited.pending.rows[0]?.percentage).toBe(80);

    const discarded = editorReducer(edited, { type: 'DISCARD' });
    expect(discarded.pending.rows[0]?.percentage).toBe(50);
    expect(discarded.pending.rows[0]?.edgeId).toBe(101); // edge id survives
    expect(discarded.pending.rows[0]?.key).toBe('edge-101');
  });
});
