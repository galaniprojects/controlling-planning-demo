/**
 * Stage 1 distribution module entry point per FD-3 [F-S1-01..08].
 *
 * The list view drives a single, effective-dated version through three
 * inner surfaces:
 *
 * - **Edges list** — every Stage 1 edge for the selected production
 *   version, with source-type / search filters. The legacy `year` /
 *   `version` selectors are gone — Stage 1 is cadence-agnostic per
 *   [F-S1-02] and resolution is by `active_from` only.
 * - **Per-entity Stage 1 view** [F-S1-06] — opened by clicking a
 *   source entity. Surfaces outbound edges + to-business +
 *   self-retained + effective cost + per-edge rationale + history.
 * - **Version diff** [F-S1-07] — opened from the version selector
 *   row.
 *
 * The version selector resolves to one of:
 * - The server-resolved in-force production version (latest active
 *   with `active_from ≤ today` — surfaced via the `In force` chip).
 * - Any other production version (active or draft).
 *
 * Drafts open the per-edge editor (`EntityDistributionEditor`).
 * Active versions are read-only; the editor's edit affordances are
 * hidden by the parent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight, ChevronDown, FilterX, GitCompareArrows, Pencil,
  Plus, Search, Sparkles, Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { chargingApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  ChargeableEntityType,
  DistributionEdgeItem,
  DistributionVersionDetailResponse,
  DistributionVersionResponse,
} from '@/types/api';
import { EntityDistributionEditor } from './EntityDistributionEditor';
import { EntityStage1View } from './EntityStage1View';
import { ActivateVersionDialog } from './versions/ActivateVersionDialog';
import { CreateVersionDialog } from './versions/CreateVersionDialog';
import { VersionDiffView } from './versions/VersionDiffView';
import { VersionSelector } from './versions/VersionSelector';
import { VersionStatusBadge } from './versions/VersionStatusBadge';
import {
  formatVersionDate,
  formatVersionDateTime,
  originLabel,
} from './versions/versionLabels';

const ENTITY_TYPE_OPTIONS: {
  value: 'all' | ChargeableEntityType;
  label: string;
}[] = [
  { value: 'all', label: 'All entity types' },
  { value: 'Project', label: 'Projects' },
  { value: 'Offering', label: 'Offerings' },
  { value: 'InternalService', label: 'Internal Services' },
];

type ListMode =
  | { kind: 'list' }
  | { kind: 'per_entity'; entityId: string }
  | { kind: 'editor'; entityId: string; versionId: number }
  | { kind: 'diff'; versionId: number };

export function DistributionListView() {
  // Service Workbench Wave C: when the user arrives via
  // `/charging?section=distribution&entity=<id>` (e.g. clicking tile 2,1
  // on the entity Workbench), land directly on the per-entity Stage 1
  // surface for that entity instead of the global edges list. The FD-3
  // modal-within-list `'per_entity'` mode already exists; we just need
  // to seed it from the URL on mount.
  const [searchParams] = useSearchParams();
  const initialEntityParam = searchParams.get('entity');

  const [versions, setVersions] = useState<DistributionVersionResponse[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(
    null,
  );

  const [edges, setEdges] = useState<DistributionEdgeItem[]>([]);
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [edgesLoading, setEdgesLoading] = useState(false);
  const [edgesError, setEdgesError] = useState<string | null>(null);

  const [entityTypeFilter, setEntityTypeFilter] = useState<
    'all' | ChargeableEntityType
  >('all');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activatingDraft, setActivatingDraft] =
    useState<DistributionVersionDetailResponse | null>(null);

  const [mode, setMode] = useState<ListMode>(
    initialEntityParam
      ? { kind: 'per_entity', entityId: initialEntityParam }
      : { kind: 'list' },
  );

  /* ─────────────────────────── data fetchers ────────────────────────── */

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await chargingApi.listDistributionVersions({
        include_scenario: false,
      });
      setVersions(res.items);
    } catch (e: unknown) {
      setVersionsError(
        e instanceof Error ? e.message : 'Failed to load versions',
      );
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const fetchEdges = useCallback(async (versionId: number) => {
    setEdgesLoading(true);
    setEdgesError(null);
    try {
      const [distRes, entRes] = await Promise.all([
        chargingApi.listDistributions({ version_id: versionId }),
        chargingApi.listEntities({ is_active: true }),
      ]);
      setEdges(distRes.items);
      setEntities(entRes.items);
    } catch (e: unknown) {
      setEdgesError(e instanceof Error ? e.message : 'Failed to load edges');
      setEdges([]);
      setEntities([]);
    } finally {
      setEdgesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Default-select the in-force version (latest active by active_from)
  // once versions load. If none active yet, fall back to the most recent
  // draft so the user lands on something editable.
  useEffect(() => {
    if (versions.length === 0 || selectedVersionId !== null) return;
    const inForce = pickInForceVersionId(versions);
    if (inForce !== null) {
      setSelectedVersionId(inForce);
    } else {
      const drafts = versions
        .filter((v) => v.status === 'draft' && v.scenario_id === null)
        .sort((a, b) => b.id - a.id);
      if (drafts.length > 0) setSelectedVersionId(drafts[0].id);
    }
  }, [versions, selectedVersionId]);

  useEffect(() => {
    if (selectedVersionId !== null) fetchEdges(selectedVersionId);
  }, [selectedVersionId, fetchEdges]);

  /* ─────────────────────────── memos ────────────────────────────────── */

  const entityById = useMemo(() => {
    const m = new Map<string, ChargeableEntityItem>();
    entities.forEach((e) => m.set(e.id, e));
    return m;
  }, [entities]);

  const inForceVersionId = useMemo(
    () => pickInForceVersionId(versions),
    [versions],
  );

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const activeVersions = useMemo(
    () =>
      versions.filter((v) => v.status === 'active' && v.scenario_id === null),
    [versions],
  );

  const filteredEdges = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return edges.filter((e) => {
      const src = entityById.get(e.source_entity_id);
      const dst = entityById.get(e.destination_entity_id);
      if (entityTypeFilter !== 'all' && src?.entity_type !== entityTypeFilter)
        return false;
      if (lower) {
        const blob = [
          src?.name ?? '',
          src?.identifier ?? '',
          dst?.name ?? '',
          dst?.identifier ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [edges, entityTypeFilter, search, entityById]);

  const sourceCount = useMemo(
    () => new Set(filteredEdges.map((e) => e.source_entity_id)).size,
    [filteredEdges],
  );

  /* ─────────────────────────── handlers ─────────────────────────────── */

  const refreshAll = useCallback(async () => {
    await fetchVersions();
    if (selectedVersionId !== null) await fetchEdges(selectedVersionId);
  }, [fetchVersions, fetchEdges, selectedVersionId]);

  const handleCreated = useCallback(
    async (detail: DistributionVersionDetailResponse) => {
      setCreateOpen(false);
      await fetchVersions();
      setSelectedVersionId(detail.version.id);
    },
    [fetchVersions],
  );

  const handleActivate = useCallback(async () => {
    if (selectedVersion?.status !== 'draft') return;
    try {
      const detail = await chargingApi.getDistributionVersion(
        selectedVersion.id,
      );
      setActivatingDraft(detail);
      setActivateOpen(true);
    } catch (e: unknown) {
      // surface inline via versionsError so the user sees it
      setVersionsError(
        e instanceof Error ? e.message : 'Failed to load draft for activation',
      );
    }
  }, [selectedVersion]);

  const handleActivated = useCallback(async () => {
    setActivateOpen(false);
    setActivatingDraft(null);
    await refreshAll();
  }, [refreshAll]);

  const handleDeleteDraft = useCallback(async () => {
    if (
      !selectedVersion ||
      selectedVersion.status !== 'draft' ||
      !window.confirm(
        `Delete draft v${selectedVersion.id}? This removes the version and all its edges.`,
      )
    )
      return;
    try {
      await chargingApi.deleteDistributionVersion(selectedVersion.id);
      setSelectedVersionId(null);
      await fetchVersions();
    } catch (e: unknown) {
      setVersionsError(
        e instanceof Error ? e.message : 'Failed to delete draft',
      );
    }
  }, [selectedVersion, fetchVersions]);

  /* ─────────────────────────── sub-screens ──────────────────────────── */

  if (mode.kind === 'editor') {
    return (
      <EntityDistributionEditor
        entityId={mode.entityId}
        versionId={mode.versionId}
        onBack={() => {
          setMode({ kind: 'list' });
          refreshAll();
        }}
      />
    );
  }
  if (mode.kind === 'per_entity') {
    return (
      <EntityStage1View
        entityId={mode.entityId}
        initialVersionId={selectedVersionId ?? undefined}
        onBack={() => setMode({ kind: 'list' })}
        onEditDraft={(versionId) =>
          setMode({ kind: 'editor', entityId: mode.entityId, versionId })
        }
        onCompareToPrior={(versionId) => setMode({ kind: 'diff', versionId })}
      />
    );
  }
  if (mode.kind === 'diff') {
    return (
      <VersionDiffView
        versionId={mode.versionId}
        versions={versions}
        onBack={() => setMode({ kind: 'list' })}
      />
    );
  }

  /* ─────────────────────────── render ───────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Version control card */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Stage 1 distribution version
              </h3>
              {inForceVersionId !== null && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary dark:bg-primary/20 px-2 py-0.5 text-[11px] font-medium">
                  <Sparkles className="h-3 w-3" />
                  In force: v{inForceVersionId}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Effective-dated per <span className="font-mono">[F-S1-02]</span>.
              The resolver picks the latest active version with{' '}
              <span className="font-mono">active_from ≤ today</span>. Drafts are
              editable; active versions are immutable per{' '}
              <span className="font-mono">[F-S1-08]</span>.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create version
            </Button>
          </div>
        </div>

        {versionsLoading ? (
          <Skeleton className="h-9 w-[320px]" />
        ) : versionsError ? (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              {versionsError}
            </p>
          </Card>
        ) : versions.length === 0 ? (
          <EmptyState
            icon={ChevronDown}
            size="sm"
            title="No versions yet"
            description="Stage 1 distribution starts with a seed version. Create a draft to begin."
            action={{
              label: 'Create first version',
              onClick: () => setCreateOpen(true),
            }}
          />
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <VersionSelector
              versions={versions}
              selectedVersionId={selectedVersionId}
              inForceVersionId={inForceVersionId}
              onChange={setSelectedVersionId}
            />
            {selectedVersion && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedVersion.status === 'draft' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleActivate}
                    >
                      Activate…
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDeleteDraft}
                      title="Delete draft (and its edges)"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMode({ kind: 'diff', versionId: selectedVersion.id })
                  }
                >
                  <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
                  Compare
                </Button>
              </div>
            )}
          </div>
        )}

        {selectedVersion && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <VersionStatusBadge
                status={selectedVersion.status}
                isInForce={selectedVersion.id === inForceVersionId}
                origin={selectedVersion.origin}
              />
              <span className="text-xs text-muted-foreground">
                {selectedVersion.active_from
                  ? `from ${formatVersionDate(selectedVersion.active_from)}`
                  : 'unscheduled'}
                {selectedVersion.activated_at && (
                  <>
                    {' · '}activated{' '}
                    {formatVersionDateTime(selectedVersion.activated_at)}
                  </>
                )}
                {selectedVersion.copied_from_version_id !== null && (
                  <> · copied from v{selectedVersion.copied_from_version_id}</>
                )}
              </span>
            </div>
            {(selectedVersion.rationale || '').trim() && (
              <p className="text-[12px] text-muted-foreground leading-snug">
                {selectedVersion.rationale}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/80">
              Origin: {originLabel(selectedVersion.origin)}
            </p>
          </div>
        )}
      </Card>

      {/* Header KPI strip (now per-version) */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Edges
          </p>
          <p className="text-lg font-semibold text-foreground">
            {filteredEdges.length}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Source entities
          </p>
          <p className="text-lg font-semibold text-foreground">
            {sourceCount}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Version
          </p>
          <p className="text-lg font-semibold text-foreground">
            {selectedVersion ? `v${selectedVersion.id}` : '—'}
          </p>
        </Card>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Source type
            </label>
            <Select
              value={entityTypeFilter}
              onValueChange={(v) =>
                setEntityTypeFilter(v as 'all' | ChargeableEntityType)
              }
            >
              <SelectTrigger className="w-[200px] h-9">
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
          <div className="space-y-1 flex-1 min-w-[220px]">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Source / destination identifier or name…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Edges table */}
      <Card>
        {edgesLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : edgesError ? (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              {edgesError}
            </p>
          </Card>
        ) : selectedVersionId === null ? (
          <EmptyState
            icon={ChevronDown}
            title="Pick a version"
            description="Select a production version above to inspect its Stage 1 edges."
          />
        ) : filteredEdges.length === 0 ? (
          <EmptyState
            icon={FilterX}
            title="No distribution edges"
            description={
              edges.length === 0
                ? 'This version has no edges yet. Create some via the per-entity editor.'
                : 'No edges match the current filters. Adjust or clear them to see all edges.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead></TableHead>
                <TableHead>Destination entity</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                <TableHead>Rationale</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEdges.map((edge) => {
                const src = entityById.get(edge.source_entity_id);
                const dst = entityById.get(edge.destination_entity_id);
                return (
                  <TableRow key={edge.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() =>
                          setMode({
                            kind: 'per_entity',
                            entityId: edge.source_entity_id,
                          })
                        }
                        className="text-left hover:text-primary"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {src?.name ?? edge.source_entity_id}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {src?.identifier ?? edge.source_entity_id}
                          </span>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      {src?.entity_type && (
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {src.entity_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-1">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground">
                          {dst?.name ?? edge.destination_entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {dst?.identifier ?? edge.destination_entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {edge.percentage.toFixed(2).replace('.', ',')}%
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {(edge.rationale ?? '').trim() ? (
                        <p
                          className="text-[11px] text-foreground leading-snug line-clamp-2"
                          title={edge.rationale ?? ''}
                        >
                          {edge.rationale}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">
                          —
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {selectedVersion?.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setMode({
                              kind: 'editor',
                              entityId: edge.source_entity_id,
                              versionId: selectedVersion.id,
                            })
                          }
                          title="Edit source entity's distribution profile"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modals */}
      <CreateVersionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        versions={versions}
        inForceVersionId={inForceVersionId}
        onCreated={handleCreated}
      />
      <ActivateVersionDialog
        open={activateOpen}
        onClose={() => {
          setActivateOpen(false);
          setActivatingDraft(null);
        }}
        draft={activatingDraft}
        activeVersions={activeVersions}
        onActivated={handleActivated}
      />
    </div>
  );
}

/**
 * Resolve the in-force production version client-side from the version
 * list. Mirrors the backend `resolve_active_version(db, today)` semantics
 * per FD-3 [F-S1-02]: production-only (`scenario_id IS NULL`), active,
 * latest `active_from ≤ today`.
 *
 * The backend remains the authority — this helper exists only to
 * highlight the "In force" chip without an extra round trip. Demo date
 * is April 2026 per CLAUDE.md; in the demo runtime, `new Date()`
 * resolves to the same anchor the seed established.
 */
function pickInForceVersionId(
  versions: DistributionVersionResponse[],
): number | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = versions.filter(
    (v) =>
      v.status === 'active' &&
      v.scenario_id === null &&
      v.active_from !== null &&
      v.active_from <= today,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    (b.active_from ?? '').localeCompare(a.active_from ?? ''),
  );
  return candidates[0]?.id ?? null;
}
