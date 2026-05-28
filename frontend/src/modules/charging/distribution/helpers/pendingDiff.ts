/**
 * Pure diff from `(serverSnapshot, pending) → mutation list` used by
 * the Distribution Editor's batched whole-form Save (Session 5
 * spec §5.6).
 *
 * The editor maintains a `pending` state that may include rows in any
 * of these forms:
 *  - **existing-unchanged**: `edgeId != null`, percentage / rationale
 *    match the server snapshot, `!isDeleted`
 *  - **existing-edited**: `edgeId != null`, percentage or rationale
 *    differs
 *  - **existing-deleted**: `edgeId != null`, `isDeleted = true`
 *  - **new**: `edgeId === null`, `isNew = true`, `!isDeleted`
 *  - **new-then-deleted** (rare): both `isNew` and `isDeleted` — never
 *    leaves the client (no server-side mutation needed)
 *
 * Output is a flat list of typed mutations the orchestrator fires
 * sequentially in this order to avoid transient over-allocation 409s:
 *
 *     deletes  →  updates  →  creates  →  toBusinessPct
 *
 * Reasoning: shrinking the share comes first so any subsequent
 * increase / addition has headroom; the to-business write goes last
 * since the same sum-rule applies to it.
 *
 * To-business is a separate mutation — included in the result struct
 * but always last. Caller passes `toBusinessPct` from the snapshot to
 * decide whether to emit it.
 */

import type { ProjectableRow } from './projectAllocation';

export interface PendingRowDiffInput extends ProjectableRow {
  /** FK to `distributions.id`. NULL = new row not yet persisted. */
  edgeId: number | null;
  rationale: string;
  isNew: boolean;
  isDeleted: boolean;
}

export interface ServerEdgeSnapshot {
  id: number;
  destinationId: string;
  percentage: number;
  rationale: string;
}

export type DistributionMutation =
  | { kind: 'delete'; edgeId: number }
  | {
      kind: 'update';
      edgeId: number;
      percentage: number;
      rationale: string | null;
    }
  | {
      kind: 'create';
      destinationId: string;
      percentage: number;
      rationale: string | null;
    };

export interface MutationPlan {
  /** Sequenced 1..N — fire in array order to avoid sum-rule 409s. */
  mutations: DistributionMutation[];
  /**
   * Whether to PUT the entity to-business %. NULL if pending matches
   * server snapshot. Always run after `mutations`.
   */
  toBusinessPct: number | null;
}

function rationaleOrNull(s: string): string | null {
  const trimmed = (s ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function rationalesDiffer(snapshot: string, pending: string): boolean {
  const a = (snapshot ?? '').trim();
  const b = (pending ?? '').trim();
  return a !== b;
}

function percentagesDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.0001;
}

/**
 * Build the mutation plan from the editor's pending state. Pure.
 */
export function buildMutationPlan(input: {
  serverEdges: ServerEdgeSnapshot[];
  pendingRows: PendingRowDiffInput[];
  serverToBusinessPct: number;
  pendingToBusinessPct: number;
}): MutationPlan {
  const byId = new Map<number, ServerEdgeSnapshot>();
  for (const e of input.serverEdges) byId.set(e.id, e);

  const deletes: DistributionMutation[] = [];
  const updates: DistributionMutation[] = [];
  const creates: DistributionMutation[] = [];

  for (const row of input.pendingRows) {
    // New row that was added then removed before save → no-op.
    if (row.isNew && row.isDeleted) continue;

    if (row.edgeId !== null) {
      const snap = byId.get(row.edgeId);
      if (!snap) {
        // Defensive: pending references an edge that's gone server-side
        // (someone else activated a different version). Skip — the
        // post-save refetch will reconcile.
        continue;
      }
      if (row.isDeleted) {
        deletes.push({ kind: 'delete', edgeId: row.edgeId });
        continue;
      }
      const pctChanged = percentagesDiffer(row.percentage, snap.percentage);
      const ratChanged = rationalesDiffer(snap.rationale, row.rationale);
      if (pctChanged || ratChanged) {
        updates.push({
          kind: 'update',
          edgeId: row.edgeId,
          percentage: row.percentage,
          rationale: rationaleOrNull(row.rationale),
        });
      }
      continue;
    }

    // New row.
    if (row.isNew) {
      creates.push({
        kind: 'create',
        destinationId: row.destinationId,
        percentage: row.percentage,
        rationale: rationaleOrNull(row.rationale),
      });
    }
  }

  const toBusinessPct = percentagesDiffer(
    input.serverToBusinessPct,
    input.pendingToBusinessPct,
  )
    ? input.pendingToBusinessPct
    : null;

  return {
    mutations: [...deletes, ...updates, ...creates],
    toBusinessPct,
  };
}

/**
 * Convenience — `true` when the plan would actually hit the server.
 * The Save button uses this to grey itself out on a clean form.
 */
export function planIsDirty(plan: MutationPlan): boolean {
  return plan.mutations.length > 0 || plan.toBusinessPct !== null;
}
