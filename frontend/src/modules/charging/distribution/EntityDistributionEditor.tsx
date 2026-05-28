/**
 * Single-entity Stage 1 distribution editor — rebuilt for the Service
 * Workbench Wave B / Session 5 spec (`§5 Distribution Editor redesign`).
 *
 * The editor is now a **whole-form batched save** surface:
 *
 *  - The destination table lets the user freely edit percentages and
 *    rationale strings on existing edges, soft-delete rows, and add new
 *    targets via the entity picker. Nothing hits the server until the
 *    user clicks **Save distribution** — at which point the editor
 *    builds a sequenced mutation plan (deletes → updates → creates →
 *    to-business %) and fires it via `chargingApi`.
 *
 *  - A live **Sum Validation Bar** and an optional **Allocation
 *    Preview Panel** read from a single pure projection
 *    (`projectAllocation`) so they stay in sync without re-fetching.
 *
 *  - All FD-3 mechanics are preserved:
 *      • `VersionSelector` slot in the entity header — switches version
 *        in place; pending edits are discarded on switch.
 *      • Per-edge `rationale` field is editable on draft rows; surfaces
 *        as italic muted text on active versions.
 *      • Active versions render fully read-only — no inputs, no "+ Add",
 *        no Save/Discard. (`[F-S1-08]` enforced server-side; the UI
 *        just doesn't offer the affordance.)
 *      • Cycle 409 detail is parsed via `parseAllocationError` (lifted
 *        from the legacy editor's `JSON.parse(err.message)` pattern at
 *        lines 766–781).
 *      • Depth 409 (`violating_path`) is parsed and surfaced — Wave B
 *        addition; depth validation lives behind the same 409 envelope.
 *
 * The Simulator path (`DistributionSandboxHandlers`) is preserved:
 * when any `onSandbox*` handler is provided, the corresponding mutation
 * routes through it instead of `chargingApi`. The handler shapes match
 * the v5 contract (`(year, source, destination, percentage)`); the
 * Wave-B rewrite does not migrate the simulator path — that stays for
 * a future session.
 *
 * Commit cadence:
 *  1. Helpers + error parser + tests (foundation, no UI).
 *  2. This file — shell + table + sum bar + batched save + temporary
 *     in-place add picker.
 *  3. Swap the temp picker for the candidates-driven EntityPickerDialog.
 *  4. Allocation preview side panel.
 *  5. Depth-violation banner copy + dark-mode pass + screenshots.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AlertTriangle, ArrowLeft, Search, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import type {
  CascadeChainResponse,
  ChargeableEntityItem,
  ChargeableEntityType,
  DistributionVersionResponse,
} from '@/types/api';
import { parseAllocationError } from './errors/parseAllocationError';
import {
  buildMutationPlan,
  planIsDirty,
  type DistributionMutation,
  type ServerEdgeSnapshot,
} from './helpers/pendingDiff';
import { projectAllocation } from './helpers/projectAllocation';
import { VersionSelector } from './versions/VersionSelector';
import { DistributionTable } from './editor/DistributionTable';
import { DistributionRow, subtypeStripClass } from './editor/DistributionRow';
import { ToBusinessRow } from './editor/ToBusinessRow';
import { SelfRetainedRow } from './editor/SelfRetainedRow';
import { SumValidationBar } from './editor/SumValidationBar';
import { AddDistributionTargetButton } from './editor/AddDistributionTargetButton';
import { EntityHeaderCard } from './editor/EntityHeaderCard';
import { EditorActionBar } from './editor/EditorActionBar';
import {
  editorReducer,
  initialEditorState,
  rowIsEdited,
} from './editor/state';

/* -------------------------------------------------------------------------- */
/* Public component contract — unchanged from FD-3 so existing callers        */
/* (DistributionListView, WorkbenchBTCTab, simulator CostAllocationSurface)   */
/* keep working without touching their call sites.                            */
/* -------------------------------------------------------------------------- */

export interface DistributionSandboxHandlers {
  onSandboxCreateEdge?: (input: {
    year: number;
    source_entity_id: string;
    destination_entity_id: string;
    percentage: number;
  }) => Promise<unknown>;
  onSandboxUpdateEdge?: (
    edgeId: number,
    input: { percentage: number },
  ) => Promise<unknown>;
  onSandboxDeleteEdge?: (edgeId: number) => Promise<unknown>;
  onSandboxSetToBusiness?: (input: {
    entity_id: string;
    year: number;
    new_pct: number;
  }) => Promise<unknown>;
}

interface Props extends DistributionSandboxHandlers {
  entityId: string;
  versionId?: number;
  /** Legacy — preserved for the simulator path. Defaults to current calendar year. */
  year?: number;
  /** Legacy — kept as a marker so existing callers don't break (`'forecast'` etc.). */
  version?: string;
  onBack?: () => void;
}

const DEFAULT_LEGACY_YEAR = new Date().getFullYear();

export function EntityDistributionEditor({
  entityId,
  versionId: versionIdProp,
  year: yearProp,
  onBack,
  onSandboxCreateEdge,
  onSandboxUpdateEdge,
  onSandboxDeleteEdge,
  onSandboxSetToBusiness,
}: Props) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  /** Map of destination entity id → distribution edge id, resolved from the
   *  summary endpoint (cascade doesn't carry the pk). */
  const [edgeIdByDestId, setEdgeIdByDestId] = useState<Map<string, number>>(
    new Map(),
  );
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(
    versionIdProp ?? null,
  );

  const legacyYear = yearProp ?? DEFAULT_LEGACY_YEAR;
  const sandboxMode =
    !!onSandboxCreateEdge ||
    !!onSandboxUpdateEdge ||
    !!onSandboxDeleteEdge ||
    !!onSandboxSetToBusiness;

  /* ───────────────────────────── data loading ──────────────────────────── */

  const fetchData = useCallback(
    async (versionIdOverride?: number | null) => {
      dispatch({ type: 'LOAD_START' });
      try {
        const versionParam =
          versionIdOverride !== undefined
            ? versionIdOverride
            : selectedVersionId;
        const cascadeParams =
          versionParam !== null && versionParam !== undefined
            ? { version_id: versionParam }
            : undefined;
        const summaryParams =
          versionParam !== null && versionParam !== undefined
            ? { version_id: versionParam }
            : undefined;

        const [cascade, summary, entity, versionsRes] = await Promise.all([
          chargingApi.getCascadeChain(entityId, cascadeParams),
          chargingApi.getEntityDistributionSummary(entityId, summaryParams),
          chargingApi.getEntity(entityId),
          chargingApi.listDistributionVersions({}),
        ]);

        // Cascade doesn't carry edge pk → build the lookup from summary.
        const edgeIds = new Map<string, number>();
        for (const e of summary.distributions) {
          edgeIds.set(e.destination_entity_id, e.id);
        }
        setEdgeIdByDestId(edgeIds);

        // Resolve "in force" version client-side from the listing — the
        // selector wants the latest active with active_from ≤ today. The
        // backend already filters scenarios out (include_scenario:false
        // default).
        const inForce = pickInForceVersionId(versionsRes.items);

        dispatch({
          type: 'LOAD_OK',
          cascade,
          entity,
          versions: versionsRes.items,
          inForceVersionId: inForce,
        });
        setSelectedVersionId(cascade.version.id);
      } catch (e) {
        dispatch({
          type: 'LOAD_ERROR',
          message: e instanceof Error ? e.message : 'Failed to load editor',
        });
      }
    },
    [entityId, selectedVersionId],
  );

  // (Re-)load on entity change or version-prop change.
  useEffect(() => {
    dispatch({ type: 'RESET_FOR_ENTITY' });
    setEdgeIdByDestId(new Map());
    setSelectedVersionId(versionIdProp ?? null);
    fetchData(versionIdProp ?? null);
    // We intentionally trigger only on entityId / versionIdProp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, versionIdProp]);

  /* ──────────────────────── derived projection ────────────────────────── */

  const visibleRows = useMemo(
    () => state.pending.rows.filter((r) => !r.isDeleted),
    [state.pending.rows],
  );

  const projection = useMemo(() => {
    if (!state.cascade) {
      return {
        downstream: [],
        toBusinessAmount: 0,
        distributedPct: 0,
        selfRetainedPct: 100,
        selfRetainedAmount: 0,
        isOverAllocated: false,
        isComplete: false,
      };
    }
    return projectAllocation({
      focalEffectiveCost: state.cascade.focal.effective_cost,
      rows: visibleRows.map((r) => ({
        key: r.key,
        destinationId: r.destinationId,
        percentage: r.percentage,
      })),
      toBusinessPct: state.pending.toBusinessPct,
    });
  }, [state.cascade, visibleRows, state.pending.toBusinessPct]);

  const amountByRowKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of projection.downstream) m.set(d.key, d.amount);
    return m;
  }, [projection.downstream]);

  /* ──────────────────────── save orchestration ────────────────────────── */

  const mutationPlan = useMemo(() => {
    if (!state.cascade) return null;
    const focalId = state.cascade.focal.entity_id;
    const serverEdges: ServerEdgeSnapshot[] = state.cascade.edges
      .filter((e) => e.source_entity_id === focalId)
      .map((e) => ({
        id: edgeIdByDestId.get(e.destination_entity_id) ?? -1,
        destinationId: e.destination_entity_id,
        percentage: e.percentage,
        rationale: e.rationale ?? '',
      }))
      .filter((e) => e.id > 0);
    // Patch pending rows: rows whose edgeId is still null but whose
    // destination matches a server edge get the resolved id stitched in
    // for the diff.
    const patchedRows = state.pending.rows.map((r) => {
      if (r.edgeId !== null || r.isNew) return r;
      const id = edgeIdByDestId.get(r.destinationId);
      return id !== undefined ? { ...r, edgeId: id } : r;
    });
    return buildMutationPlan({
      serverEdges,
      pendingRows: patchedRows.map((r) => ({
        key: r.key,
        edgeId: r.edgeId,
        destinationId: r.destinationId,
        percentage: r.percentage,
        rationale: r.rationale,
        isNew: r.isNew,
        isDeleted: r.isDeleted,
      })),
      serverToBusinessPct: state.cascade.focal.to_business_pct,
      pendingToBusinessPct: state.pending.toBusinessPct,
    });
  }, [state.cascade, state.pending, edgeIdByDestId]);

  const dirty = !!mutationPlan && planIsDirty(mutationPlan);

  const handleSave = useCallback(async () => {
    if (!state.cascade || !state.entity || !mutationPlan) return;
    if (projection.isOverAllocated) return;
    dispatch({ type: 'SAVE_START' });
    try {
      const versionId = state.resolvedVersionId;
      for (const m of mutationPlan.mutations) {
        await runMutation(m, {
          versionId,
          sourceEntityId: state.entity.id,
          sandbox: {
            year: legacyYear,
            onSandboxCreateEdge,
            onSandboxUpdateEdge,
            onSandboxDeleteEdge,
          },
        });
      }
      if (mutationPlan.toBusinessPct !== null) {
        if (onSandboxSetToBusiness) {
          await onSandboxSetToBusiness({
            entity_id: state.entity.id,
            year: legacyYear,
            new_pct: mutationPlan.toBusinessPct,
          });
        } else if (versionId !== null) {
          await chargingApi.updateEntityToBusinessPct(
            state.entity.id,
            mutationPlan.toBusinessPct,
            { version_id: versionId },
          );
        }
      }
      // Refetch to reseat pending from the server's authoritative state.
      await fetchData(versionId);
    } catch (e) {
      const parsed = parseAllocationError(
        e instanceof Error ? e.message : String(e),
      );
      dispatch({ type: 'SAVE_ERROR', error: parsed });
    }
  }, [
    state.cascade,
    state.entity,
    state.resolvedVersionId,
    mutationPlan,
    projection.isOverAllocated,
    legacyYear,
    onSandboxCreateEdge,
    onSandboxUpdateEdge,
    onSandboxDeleteEdge,
    onSandboxSetToBusiness,
    fetchData,
  ]);

  /* ───────────────────── version selector wiring ──────────────────────── */

  const handleVersionChange = useCallback(
    (vid: number) => {
      setSelectedVersionId(vid);
      fetchData(vid);
    },
    [fetchData],
  );

  /* ───────────────────────────── render ───────────────────────────────── */

  if (state.loading && !state.cascade) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state.loadError || !state.cascade || !state.entity) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-foreground">
          {state.loadError ?? 'Failed to load distribution profile.'}
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
          </Button>
        )}
      </Card>
    );
  }

  const readOnly = !sandboxMode && state.cascade.version.status === 'active';

  return (
    <div className="space-y-4">
      {/* Back nav */}
      {onBack && (
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        </div>
      )}

      {/* Entity header card with cost breakdown + version slot */}
      <EntityHeaderCard
        cascade={state.cascade}
        sandboxMode={sandboxMode}
        versionSlot={
          !sandboxMode && state.versions.length > 0 ? (
            <VersionSelector
              versions={state.versions}
              selectedVersionId={selectedVersionId}
              inForceVersionId={state.inForceVersionId}
              onChange={handleVersionChange}
              className="w-full h-auto py-1.5"
              disabled={state.loading || state.ui.saving}
            />
          ) : undefined
        }
      />

      {/* Read-only banner on active versions */}
      {readOnly && (
        <Card className="border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 flex items-start gap-2">
          <Lock className="h-4 w-4 text-blue-700 dark:text-blue-400 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Read-only: this version is active and frozen per{' '}
            <span className="font-mono">[F-S1-08]</span>. Create a new draft to
            make changes.
          </p>
        </Card>
      )}

      {/* Save-time error banner */}
      {state.ui.saveError && (
        <SaveErrorBanner
          error={state.ui.saveError}
          entitiesById={buildIdentifierLookup(state.cascade)}
          onDismiss={() => dispatch({ type: 'CLEAR_SAVE_ERROR' })}
        />
      )}

      {/* Sum-rule banner (server flag — independent of pending overflow) */}
      {!readOnly && state.cascade.focal.self_retained_pct < 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Server snapshot is already over-allocated. Adjust the rows below
            and save to bring the total back to ≤100%.
          </p>
        </Card>
      )}

      {/* Main table */}
      <DistributionTable
        hasDistributionRows={visibleRows.length > 0}
        emptyState={
          <span>
            No outgoing distributions yet. Add a target below or leave costs
            self-retained.
          </span>
        }
        rows={visibleRows.map((row) => (
          <DistributionRow
            key={row.key}
            row={row}
            amount={amountByRowKey.get(row.key) ?? 0}
            maxAllocationDepth={state.cascade!.max_allocation_depth}
            readOnly={readOnly}
            isEdited={rowIsEdited(row, state.cascade)}
            isFocused={state.ui.activeRowFocusKey === row.key}
            onChangePct={(value) =>
              dispatch({ type: 'SET_ROW_PCT', key: row.key, value })
            }
            onChangeRationale={(value) =>
              dispatch({ type: 'SET_ROW_RATIONALE', key: row.key, value })
            }
            onDelete={() => dispatch({ type: 'DELETE_ROW', key: row.key })}
            onFocus={() => dispatch({ type: 'FOCUS_ROW', key: row.key })}
            onBlur={() => dispatch({ type: 'FOCUS_ROW', key: null })}
          />
        ))}
        toBusinessRow={
          <ToBusinessRow
            toBusinessPct={state.pending.toBusinessPct}
            toBusinessAmount={projection.toBusinessAmount}
            locationCount={state.cascade.business_terminals.length}
            readOnly={readOnly}
            isEdited={
              Math.abs(
                state.pending.toBusinessPct -
                  state.cascade.focal.to_business_pct,
              ) > 0.0001
            }
            isFocused={state.ui.activeRowFocusKey === '__tbp__'}
            onChangePct={(value) => dispatch({ type: 'SET_TBP', value })}
            onFocus={() => dispatch({ type: 'FOCUS_ROW', key: '__tbp__' })}
            onBlur={() => dispatch({ type: 'FOCUS_ROW', key: null })}
          />
        }
        selfRetainedRow={
          <SelfRetainedRow
            selfRetainedPct={projection.selfRetainedPct}
            selfRetainedAmount={projection.selfRetainedAmount}
            isOverAllocated={projection.isOverAllocated}
          />
        }
      />

      {/* Sum validation bar */}
      <SumValidationBar
        rows={projection.downstream}
        toBusinessPct={state.pending.toBusinessPct}
        distributedPct={projection.distributedPct}
        selfRetainedPct={projection.selfRetainedPct}
        isOverAllocated={projection.isOverAllocated}
        isComplete={projection.isComplete}
      />

      {/* Add-target trigger (draft + non-sandbox; sandbox path doesn't have
          a version-scoped candidates endpoint yet). */}
      {!readOnly && !sandboxMode && (
        <AddDistributionTargetButton
          onClick={() => dispatch({ type: 'OPEN_PICKER' })}
        />
      )}

      {/* Action bar */}
      <EditorActionBar
        dirty={dirty}
        saving={state.ui.saving}
        isOverAllocated={projection.isOverAllocated}
        sidePanelOpen={state.ui.sidePanelOpen}
        readOnly={readOnly}
        onSave={handleSave}
        onDiscard={() => dispatch({ type: 'DISCARD' })}
        onToggleSidePanel={() => dispatch({ type: 'TOGGLE_SIDE_PANEL' })}
      />

      {/* Temporary inline picker — replaced in commit 3 by
          EntityPickerDialog backed by the candidates endpoint. */}
      <TempEntityPickerDialog
        open={state.ui.pickerOpen}
        onClose={() => dispatch({ type: 'CLOSE_PICKER' })}
        sourceEntityId={state.entity.id}
        existingDestinationIds={new Set(state.pending.rows.map((r) => r.destinationId))}
        onPick={(picked) =>
          dispatch({
            type: 'ADD_ROW',
            row: {
              edgeId: null,
              destinationId: picked.id,
              destinationName: picked.name,
              destinationIdentifier: picked.identifier,
              destinationType: picked.entity_type,
              percentage: 0,
              rationale: '',
              chainDepth: null,
              nearMaxDepthWarning: false,
            },
          })
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pickInForceVersionId(
  versions: DistributionVersionResponse[],
): number | null {
  const today = new Date().toISOString().slice(0, 10);
  let best: DistributionVersionResponse | null = null;
  for (const v of versions) {
    if (v.scenario_id !== null) continue;
    if (v.status !== 'active') continue;
    if (!v.active_from || v.active_from > today) continue;
    if (!best || (v.active_from ?? '') > (best.active_from ?? '')) {
      best = v;
    }
  }
  return best?.id ?? null;
}

/** Lookup table: entity id → identifier string, used by the cycle/depth
 *  banner so it can render `ITF00001 → ITF00002 → ITF00001` instead of
 *  opaque UUIDs. Pulls from both upstream + downstream + focal + the
 *  current pending rows (covers brand-new edges). */
function buildIdentifierLookup(
  cascade: CascadeChainResponse,
): Map<string, string> {
  const m = new Map<string, string>();
  m.set(cascade.focal.entity_id, cascade.focal.identifier);
  for (const n of cascade.upstream) m.set(n.entity_id, n.identifier);
  for (const n of cascade.downstream) m.set(n.entity_id, n.identifier);
  return m;
}

/** Sequentially run one mutation against either chargingApi or the
 *  sandbox callbacks. The throw bubbles to the orchestrator. */
async function runMutation(
  m: DistributionMutation,
  ctx: {
    versionId: number | null;
    sourceEntityId: string;
    sandbox: {
      year: number;
      onSandboxCreateEdge?: DistributionSandboxHandlers['onSandboxCreateEdge'];
      onSandboxUpdateEdge?: DistributionSandboxHandlers['onSandboxUpdateEdge'];
      onSandboxDeleteEdge?: DistributionSandboxHandlers['onSandboxDeleteEdge'];
    };
  },
): Promise<void> {
  switch (m.kind) {
    case 'delete':
      if (ctx.sandbox.onSandboxDeleteEdge) {
        await ctx.sandbox.onSandboxDeleteEdge(m.edgeId);
      } else {
        await chargingApi.deleteDistribution(m.edgeId);
      }
      return;
    case 'update':
      if (ctx.sandbox.onSandboxUpdateEdge) {
        await ctx.sandbox.onSandboxUpdateEdge(m.edgeId, {
          percentage: m.percentage,
        });
      } else {
        await chargingApi.updateDistribution(m.edgeId, {
          percentage: m.percentage,
          rationale: m.rationale,
        });
      }
      return;
    case 'create':
      if (ctx.sandbox.onSandboxCreateEdge) {
        await ctx.sandbox.onSandboxCreateEdge({
          year: ctx.sandbox.year,
          source_entity_id: ctx.sourceEntityId,
          destination_entity_id: m.destinationId,
          percentage: m.percentage,
        });
      } else {
        if (ctx.versionId === null) {
          throw new Error('Version not resolved — cannot create distribution.');
        }
        await chargingApi.createDistribution({
          version_id: ctx.versionId,
          source_entity_id: ctx.sourceEntityId,
          destination_entity_id: m.destinationId,
          percentage: m.percentage,
          rationale: m.rationale,
        });
      }
      return;
  }
}

/* -------------------------------------------------------------------------- */
/* SaveErrorBanner — typed messaging for cycle / depth / generic 409s         */
/* -------------------------------------------------------------------------- */

function SaveErrorBanner({
  error,
  entitiesById,
  onDismiss,
}: {
  error: ReturnType<typeof parseAllocationError>;
  entitiesById: Map<string, string>;
  onDismiss: () => void;
}) {
  const label = (id: string) => entitiesById.get(id) ?? id;
  let body: React.ReactNode;
  if (error.type === 'cycle') {
    body = (
      <>
        <p className="text-sm text-red-800 dark:text-red-300 font-medium">
          Save rejected — cycle detected
        </p>
        <p className="text-[11px] mt-1.5 font-mono text-red-700 dark:text-red-400">
          {error.cycleChain.map(label).join(' → ')}
        </p>
        <p className="text-[11px] text-red-700/80 dark:text-red-400/80 mt-1">
          {error.message}
        </p>
      </>
    );
  } else if (error.type === 'depth') {
    body = (
      <>
        <p className="text-sm text-red-800 dark:text-red-300 font-medium">
          Save rejected — max allocation depth exceeded
        </p>
        <p className="text-[11px] mt-1.5 font-mono text-red-700 dark:text-red-400">
          {error.violatingPath.map(label).join(' → ')}{' '}
          <span className="ml-1 opacity-70">(depth {error.violatingPath.length - 1})</span>
        </p>
        <p className="text-[11px] text-red-700/80 dark:text-red-400/80 mt-1">
          {error.message}
        </p>
      </>
    );
  } else {
    body = (
      <p className="text-sm text-red-800 dark:text-red-300">{error.message}</p>
    );
  }
  return (
    <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 relative">
      <div className="pr-6">{body}</div>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* TempEntityPickerDialog — minimal commit-2 picker. Commit 3 replaces this   */
/* with the candidates-endpoint-driven EntityPickerDialog that shows depth    */
/* warnings + disables `would_violate_max_depth` rows.                        */
/* -------------------------------------------------------------------------- */

const TYPE_OPTIONS: { value: 'all' | ChargeableEntityType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'Project', label: 'Projects' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal Services' },
];

function TempEntityPickerDialog({
  open,
  onClose,
  sourceEntityId,
  existingDestinationIds,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  sourceEntityId: string;
  existingDestinationIds: Set<string>;
  onPick: (e: ChargeableEntityItem) => void;
}) {
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | ChargeableEntityType>(
    'all',
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    setTypeFilter('all');
    chargingApi
      .listEntities({ is_active: true })
      .then((res) => setEntities(res.items))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return entities
      .filter((e) => e.id !== sourceEntityId)
      .filter((e) => !existingDestinationIds.has(e.id))
      .filter((e) => typeFilter === 'all' || e.entity_type === typeFilter)
      .filter((e) => {
        if (!lower) return true;
        return `${e.name} ${e.identifier}`.toLowerCase().includes(lower);
      });
  }, [entities, search, typeFilter, sourceEntityId, existingDestinationIds]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add distribution target</DialogTitle>
          <DialogDescription>
            Pick an entity to distribute a share of this service's cost to.
            New rows default to 0% — set the percentage in the table.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) =>
                setTypeFilter(v as 'all' | ChargeableEntityType)
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or identifier…"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="rounded-md border border-border max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="p-6">
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No candidates match — try a broader filter.
              </p>
            ) : (
              <ul>
                {filtered.slice(0, 200).map((e) => (
                  <li
                    key={e.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onPick(e)}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex items-stretch gap-2"
                    >
                      <span
                        className={`w-1 rounded-sm self-stretch flex-shrink-0 ${subtypeStripClass(e.entity_type)}`}
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">
                            {e.name}
                          </span>
                          <EntityTypeBadge type={e.entity_type} />
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {e.identifier}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

