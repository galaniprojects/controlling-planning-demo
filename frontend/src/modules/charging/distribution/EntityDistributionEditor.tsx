/**
 * Single-entity Stage 1 distribution editor per FD-3 [F-S1-01..08].
 *
 * Shows the entity's `to_business_pct` (editable), the list of outgoing
 * (destination, %) edges (add / edit / delete with per-edge rationale
 * per [F-S1-05]), and the derived self-retained indicator. Save-time
 * validation:
 *   - Sum rule per [F-S1-02]: to_business + sum(distribute) ≤ 100
 *   - Cycle detection per [F-S1-01..05]: backend rejects with 409 + chain
 *
 * Version-scoping (FD-3 rework):
 *
 * - **New code path** — caller passes `versionId: number` (the FK into
 *   `distribution_versions`). Edits go straight against that version.
 *   The backend rejects writes against an `active` version per
 *   [F-S1-08] with HTTP 409, so the list view only opens this editor
 *   for drafts.
 *
 * - **Legacy code path** — older callers (Workbench BTC tab, Simulator
 *   CostAllocationSurface) still pass the v4 `year` / `version` string
 *   pair. When `versionId` is absent, the editor resolves to the
 *   in-force production version via the per-entity Stage 1 endpoint
 *   (which does the server-side `resolve_active_version(today)` walk
 *   per [F-S1-02]). The simulator's sandbox-handler path is unchanged
 *   — writes still go through the caller's callbacks, not chargingApi.
 *
 * v5 B2 [B-OQ-02]: when any `onSandbox*` handler is provided, the
 * matching mutation routes through the caller's callback instead of
 * `chargingApi`. The simulator wires those to `ScenarioContext` Lever
 * 12 mutations so this F4 component never imports anything from
 * `@/modules/simulator/*`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Trash2, AlertTriangle, Save, X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatPercent } from '@/lib/formatters';
import { chargingApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
  DistributionEdgeItem,
  EntityDistributionSummary,
} from '@/types/api';

/**
 * v5 B2 [B-OQ-02]: callbacks the simulator CostAllocationSurface wires
 * to `ScenarioContext` mutations. When provided, the editor routes the
 * matching mutation through the callback instead of `chargingApi`.
 *
 * The callback shapes were locked in v5 against `(year, …)` and have
 * not been migrated for FD-3 — the simulator continues to record
 * `year` on each ScenarioAction even though the Distribution row no
 * longer stores `year` (the year axis lives on the cost, not the edge).
 * That contract stays for the v5 promote-with-routing path.
 */
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
  /**
   * New code path — the version_id this editor scopes its edits to.
   * When omitted, the editor falls back to the per-entity Stage 1
   * endpoint, which resolves to the in-force production version.
   */
  versionId?: number;
  /**
   * Legacy code path — preserved so Workbench / Simulator integrations
   * don't break. The simulator records `year` in ScenarioAction params;
   * it is no longer used to query Distribution rows.
   */
  year?: number;
  /**
   * Legacy code path — string discriminator that v4 used to select
   * `'forecast' | 'baseline' | 'actuals' | 'scenario-<id>'`. Post-FD-3
   * production strings collapse to the in-force resolver pick; scenario
   * strings continue to function only because the sandbox handlers
   * intercept writes (the editor's read may surface production edges
   * for the scenario case — a small visual gap until the simulator
   * surface migrates to passing `versionId` directly).
   */
  version?: string;
  /**
   * Optional. Provided by the Charging list view (returns to the list)
   * and the Simulator surface (collapses the inline editor). Workbench
   * / Run Portfolio embeddings omit `onBack` to suppress the inner
   * button per v5.1 user feedback.
   */
  onBack?: () => void;
}

const ENTITY_TYPE_OPTIONS: {
  value: 'all' | ChargeableEntityType;
  label: string;
}[] = [
  { value: 'all', label: 'All types' },
  { value: 'Project', label: 'Projects' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal Services' },
];

const DEFAULT_LEGACY_YEAR = new Date().getFullYear();

export function EntityDistributionEditor({
  entityId,
  versionId: versionIdProp,
  year: yearProp,
  version: versionProp,
  onBack,
  onSandboxCreateEdge,
  onSandboxUpdateEdge,
  onSandboxDeleteEdge,
  onSandboxSetToBusiness,
}: Props) {
  const [summary, setSummary] = useState<EntityDistributionSummary | null>(
    null,
  );
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);
  const [allEntities, setAllEntities] = useState<ChargeableEntityItem[]>([]);
  // Resolved version id used for all writes. May differ from `versionIdProp`
  // for legacy callers — the editor resolves it on first load.
  const [resolvedVersionId, setResolvedVersionId] = useState<number | null>(
    versionIdProp ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [savingTBP, setSavingTBP] = useState(false);
  const [tbpDraft, setTbpDraft] = useState<string>('');
  const [tbpError, setTbpError] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<number | null>(null);
  const [edgeDraftPct, setEdgeDraftPct] = useState<string>('');
  const [edgeDraftRationale, setEdgeDraftRationale] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [cycleChain, setCycleChain] = useState<string[] | null>(null);

  const legacyYear = yearProp ?? DEFAULT_LEGACY_YEAR;

  const fetchData = async () => {
    setLoading(true);
    try {
      // Resolve version id if not provided.
      let effectiveVersionId = versionIdProp ?? resolvedVersionId;
      if (effectiveVersionId === null || effectiveVersionId === undefined) {
        // Legacy path: ask the per-entity Stage 1 endpoint to resolve in-force.
        const view = await chargingApi.getEntityStage1View(entityId, {});
        effectiveVersionId = view.version.id;
        setResolvedVersionId(effectiveVersionId);
      }

      const [sum, ent, ents] = await Promise.all([
        chargingApi.getEntityDistributionSummary(entityId, {
          version_id: effectiveVersionId,
        }),
        chargingApi.getEntity(entityId),
        chargingApi.listEntities({ is_active: true }),
      ]);
      setSummary(sum);
      setEntity(ent);
      setAllEntities(ents.items);
      setTbpDraft(String(sum.to_business_pct));
    } catch {
      setSummary(null);
      setEntity(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, versionIdProp, versionProp]);

  const entityById = useMemo(() => {
    const map = new Map<string, ChargeableEntityItem>();
    allEntities.forEach((e) => map.set(e.id, e));
    return map;
  }, [allEntities]);

  const handleSaveToBusinessPct = async () => {
    if (!summary) return;
    const next = Number(tbpDraft);
    if (Number.isNaN(next) || next < 0 || next > 100) {
      setTbpError('Enter a percentage between 0 and 100.');
      return;
    }
    setSavingTBP(true);
    setTbpError(null);
    try {
      if (onSandboxSetToBusiness) {
        await onSandboxSetToBusiness({
          entity_id: entityId,
          year: legacyYear,
          new_pct: next,
        });
        fetchData();
      } else if (resolvedVersionId !== null) {
        const updated = await chargingApi.updateEntityToBusinessPct(
          entityId,
          next,
          { version_id: resolvedVersionId },
        );
        setSummary(updated);
        setTbpDraft(String(updated.to_business_pct));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setTbpError(message);
    } finally {
      setSavingTBP(false);
    }
  };

  const handleEditEdge = (edge: DistributionEdgeItem) => {
    setEditingEdgeId(edge.id);
    setEdgeDraftPct(String(edge.percentage));
    setEdgeDraftRationale(edge.rationale ?? '');
  };

  const handleSaveEdge = async (edge: DistributionEdgeItem) => {
    const next = Number(edgeDraftPct);
    if (Number.isNaN(next) || next <= 0 || next > 100) {
      setTbpError(`Edge ${edge.id}: percentage must be between 0 and 100.`);
      return;
    }
    try {
      if (onSandboxUpdateEdge) {
        await onSandboxUpdateEdge(edge.id, { percentage: next });
      } else {
        await chargingApi.updateDistribution(edge.id, {
          percentage: next,
          rationale: edgeDraftRationale.trim() || null,
        });
      }
      setEditingEdgeId(null);
      setEdgeDraftPct('');
      setEdgeDraftRationale('');
      fetchData();
    } catch (e: unknown) {
      setTbpError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleDeleteEdge = async (edge: DistributionEdgeItem) => {
    try {
      if (onSandboxDeleteEdge) {
        await onSandboxDeleteEdge(edge.id);
      } else {
        await chargingApi.deleteDistribution(edge.id);
      }
      fetchData();
    } catch (e: unknown) {
      setTbpError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!summary || !entity) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Failed to load distribution profile.
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to list
          </Button>
        )}
      </Card>
    );
  }

  const distributedTotal = summary.distributions.reduce(
    (s, e) => s + e.percentage,
    0,
  );
  const wouldExceed100 = (Number(tbpDraft) || 0) + distributedTotal > 100;
  const inSandboxMode =
    !!onSandboxCreateEdge ||
    !!onSandboxUpdateEdge ||
    !!onSandboxDeleteEdge ||
    !!onSandboxSetToBusiness;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {entity.name}
              </h2>
              <Badge variant="secondary" className="text-[10px]">
                {entity.entity_type}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {entity.is_change_or_run}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {entity.identifier} ·{' '}
              {inSandboxMode ? (
                <>scenario sandbox</>
              ) : (
                <>v{summary.version_id}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Sum rule status banner */}
      {!summary.sums_within_100 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Distribution exceeds 100%. Sum-rule per{' '}
            <span className="font-mono">[F-S1-02]</span> requires to-business +
            sum(edges) ≤ 100%.
          </p>
        </Card>
      )}

      {/* To-Business + derived percentages */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Distribution shape
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              To-Business %
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tbpDraft}
                onChange={(e) => setTbpDraft(e.target.value)}
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="w-[120px] h-9 font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveToBusinessPct}
                disabled={
                  savingTBP || tbpDraft === String(summary.to_business_pct)
                }
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            </div>
            {tbpError && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                {tbpError}
              </p>
            )}
            {wouldExceed100 && !tbpError && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                Would exceed 100% with current edges (
                {formatPercent(distributedTotal, {
                  signed: false,
                  decimals: 2,
                })}).
              </p>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Distributed (Σ edges)
            </label>
            <p className="text-lg font-mono text-foreground tabular-nums">
              {formatPercent(distributedTotal, {
                signed: false,
                decimals: 2,
              })}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Across {summary.distributions.length} edge
              {summary.distributions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Self-retained (derived)
            </label>
            <p className="text-lg font-mono text-foreground tabular-nums">
              {formatPercent(summary.self_retained_pct, {
                signed: false,
                decimals: 2,
              })}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Per [F-DM-02]: 100 − to-business − Σ edges
            </p>
          </div>
        </div>
      </Card>

      {/* Edges */}
      <Card>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Outgoing edges
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stage 1 inter-service distribution per{' '}
              <span className="font-mono">[F-S1-01]</span>. Per-edge rationale
              per <span className="font-mono">[F-S1-05]</span>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setAddOpen(true);
              setAddError(null);
              setCycleChain(null);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add destination
          </Button>
        </div>
        {summary.distributions.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No outgoing edges. Costs flow either to business or stay
            self-retained.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destination entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right w-[120px]">
                  Percentage
                </TableHead>
                <TableHead>Rationale</TableHead>
                <TableHead className="text-right pr-4 w-[140px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.distributions.map((edge) => {
                const dst = entityById.get(edge.destination_entity_id);
                const isEditing = editingEdgeId === edge.id;
                return (
                  <TableRow key={edge.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {dst?.name ?? edge.destination_entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {dst?.identifier ?? edge.destination_entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {dst?.entity_type && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5"
                        >
                          {dst.entity_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={edgeDraftPct}
                          onChange={(e) => setEdgeDraftPct(e.target.value)}
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          className="w-[100px] h-8 ml-auto font-mono text-right"
                        />
                      ) : (
                        <span className="font-mono text-sm tabular-nums">
                          {formatPercent(edge.percentage, {
                            signed: false,
                            decimals: 2,
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {isEditing ? (
                        <Textarea
                          value={edgeDraftRationale}
                          onChange={(e) =>
                            setEdgeDraftRationale(e.target.value)
                          }
                          placeholder="Why this destination shares this percentage…"
                          rows={2}
                          maxLength={2000}
                          className="text-[12px]"
                        />
                      ) : (edge.rationale ?? '').trim() ? (
                        <p
                          className="text-[11px] text-foreground leading-snug line-clamp-2"
                          title={edge.rationale ?? ''}
                        >
                          {edge.rationale}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          No rationale
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {isEditing ? (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveEdge(edge)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingEdgeId(null);
                              setEdgeDraftPct('');
                              setEdgeDraftRationale('');
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditEdge(edge)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEdge(edge)}
                            title="Delete edge"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddDistributionDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sourceEntity={entity}
        existingEdges={summary.distributions}
        allEntities={allEntities}
        versionId={resolvedVersionId}
        legacyYear={legacyYear}
        onSandboxCreateEdge={onSandboxCreateEdge}
        availableHeadroom={Math.max(
          0,
          100 - (summary.to_business_pct + distributedTotal),
        )}
        error={addError}
        cycleChain={cycleChain}
        entityById={entityById}
        onError={(msg, chain) => {
          setAddError(msg);
          setCycleChain(chain ?? null);
        }}
        onSaved={() => {
          setAddOpen(false);
          setAddError(null);
          setCycleChain(null);
          fetchData();
        }}
      />
    </div>
  );
}

interface AddDialogProps {
  open: boolean;
  onClose: () => void;
  sourceEntity: ChargeableEntityItem;
  existingEdges: DistributionEdgeItem[];
  allEntities: ChargeableEntityItem[];
  /** Resolved version_id this edit targets. Null when sandbox handlers
   *  intercept the write (no version_id needed for the simulator path). */
  versionId: number | null;
  /** Year recorded in `ScenarioAction.parameters_json` by the sandbox
   *  callbacks. Not used outside the sandbox path. */
  legacyYear: number;
  /** v5 B2 [B-OQ-02]: when provided, sandbox-creates the edge through
   *  the caller's callback instead of `chargingApi.createDistribution`. */
  onSandboxCreateEdge?: DistributionSandboxHandlers['onSandboxCreateEdge'];
  availableHeadroom: number;
  error: string | null;
  cycleChain: string[] | null;
  entityById: Map<string, ChargeableEntityItem>;
  onError: (message: string, cycleChain?: string[]) => void;
  onSaved: () => void;
}

function AddDistributionDialog({
  open,
  onClose,
  sourceEntity,
  existingEdges,
  allEntities,
  versionId,
  legacyYear,
  onSandboxCreateEdge,
  availableHeadroom,
  error,
  cycleChain,
  entityById,
  onError,
  onSaved,
}: AddDialogProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | ChargeableEntityType>(
    'all',
  );
  const [search, setSearch] = useState('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [percentage, setPercentage] = useState('');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTypeFilter('all');
      setSearch('');
      setDestinationId('');
      setPercentage('');
      setRationale('');
    }
  }, [open]);

  const usedDestinations = useMemo(() => {
    const set = new Set<string>();
    existingEdges.forEach((e) => set.add(e.destination_entity_id));
    return set;
  }, [existingEdges]);

  const candidateEntities = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return allEntities.filter((e) => {
      if (e.id === sourceEntity.id) return false;
      if (usedDestinations.has(e.id)) return false;
      if (typeFilter !== 'all' && e.entity_type !== typeFilter) return false;
      if (lower) {
        const blob = `${e.name} ${e.identifier}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [allEntities, search, typeFilter, usedDestinations, sourceEntity.id]);

  const handleSave = async () => {
    const pct = Number(percentage);
    if (!destinationId) {
      onError('Pick a destination entity.');
      return;
    }
    if (Number.isNaN(pct) || pct <= 0 || pct > 100) {
      onError('Enter a percentage between 0 (exclusive) and 100.');
      return;
    }
    if (pct > availableHeadroom + 0.001) {
      onError(
        `Only ${availableHeadroom.toFixed(2)}% available before the sum cap of 100% is exceeded.`,
      );
      return;
    }
    if (!onSandboxCreateEdge && versionId === null) {
      onError('Version not resolved yet — wait a moment and retry.');
      return;
    }
    setSaving(true);
    try {
      if (onSandboxCreateEdge) {
        await onSandboxCreateEdge({
          year: legacyYear,
          source_entity_id: sourceEntity.id,
          destination_entity_id: destinationId,
          percentage: pct,
        });
      } else {
        await chargingApi.createDistribution({
          version_id: versionId as number,
          source_entity_id: sourceEntity.id,
          destination_entity_id: destinationId,
          percentage: pct,
          rationale: rationale.trim() || null,
        });
      }
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      // The backend embeds cycle_chain inside a JSON detail. Detail is the
      // raw `e.message` (client.ts pulls `error.detail`). When it's a
      // structured cycle response we get a string like "[ITF00001, ...]" or
      // a JSON-stringified payload. We try to parse if it looks structured.
      let chain: string[] | undefined;
      try {
        const parsed = JSON.parse(msg);
        if (parsed && Array.isArray(parsed.cycle_chain)) {
          chain = parsed.cycle_chain as string[];
        }
      } catch {
        /* not a JSON detail — fall through */
      }
      onError(msg, chain);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add distribution edge</DialogTitle>
          <DialogDescription>
            Source: {sourceEntity.name} ({sourceEntity.identifier})
            <span className="ml-2 text-[11px] text-muted-foreground">
              Available headroom: {availableHeadroom.toFixed(2)}%
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Destination type
              </label>
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
                  {ENTITY_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Search
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Identifier or name…"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Destination entity ({candidateEntities.length} available)
            </label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a destination…" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                {candidateEntities.slice(0, 200).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="text-sm">{e.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground ml-2">
                      {e.identifier}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Percentage
            </label>
            <Input
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              className="h-9 font-mono"
              placeholder="e.g. 25.00"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rationale{' '}
              <span className="font-normal normal-case text-muted-foreground/80">
                (optional)
              </span>
            </label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this destination shares this percentage…"
              rows={2}
              maxLength={2000}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              First-class per <span className="font-mono">[F-S1-05]</span>.
              Editable later from the row.
            </p>
          </div>

          {error && (
            <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              {cycleChain && cycleChain.length > 0 && (
                <p className="text-[11px] mt-1.5 font-mono text-red-700 dark:text-red-400">
                  Cycle chain:{' '}
                  {cycleChain
                    .map((id) => entityById.get(id)?.identifier ?? id)
                    .join(' → ')}
                </p>
              )}
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !destinationId || !percentage}
          >
            {saving ? 'Saving…' : 'Add edge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
