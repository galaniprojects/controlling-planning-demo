/**
 * Per-entity Stage 1 distribution surface per FD-3 [F-S1-06].
 *
 * The first-class per-entity view: for one service / offering / project
 * — outbound edges, To-Business %, derived self-retained residual,
 * effective cost, per-edge rationale, and the effective-dated version
 * history sidebar. Everything in one round trip via
 * `chargingApi.getEntityStage1View(entity_id, { evaluated_date?,
 * version_id? })`.
 *
 * Read-only by design (the per-edge editor lives in
 * `EntityDistributionEditor.tsx` and is opened from the list / detail
 * via the existing "Edit" affordance). The version-history sidebar
 * lets the user pin the view to a past production version to see what
 * the entity's outbound shape looked like then.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  Clock, GitCompareArrows, History, Pencil, Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrencyDetailed, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { chargingApi } from '@/api/endpoints';
import type {
  DistributionEdgeItem,
  EntityStage1View as EntityStage1ViewPayload,
  EntityStage1VersionEntry,
} from '@/types/api';
import { VersionStatusBadge } from './versions/VersionStatusBadge';
import {
  formatVersionDate,
  formatVersionDateTime,
  originLabel,
} from './versions/versionLabels';

export interface EntityStage1ViewProps {
  entityId: string;
  /** Optional initial version pin — defaults to the in-force resolver pick. */
  initialVersionId?: number;
  /** Back to the parent list / portfolio view. */
  onBack?: () => void;
  /**
   * Open the editor scoped to a draft version. Wired by the list view to
   * route the user to `EntityDistributionEditor`. When omitted, the
   * "Edit edges" affordance is hidden (the surface is then purely
   * informational — Workbench / Run Portfolio embeddings rely on this).
   */
  onEditDraft?: (versionId: number) => void;
  /**
   * Open the diff view scoped to this version. Wired by the list view.
   */
  onCompareToPrior?: (versionId: number) => void;
}

export function EntityStage1View({
  entityId,
  initialVersionId,
  onBack,
  onEditDraft,
  onCompareToPrior,
}: EntityStage1ViewProps) {
  const [payload, setPayload] = useState<EntityStage1ViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedVersionId, setPinnedVersionId] = useState<number | undefined>(
    initialVersionId,
  );
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    chargingApi
      .getEntityStage1View(entityId, { version_id: pinnedVersionId })
      .then((p) => setPayload(p))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load view'),
      )
      .finally(() => setLoading(false));
  }, [entityId, pinnedVersionId]);

  // When the payload arrives, sync the pin to the resolved version so
  // subsequent renders use the resolved id (e.g. user clicks a history row).
  // Skipped if a pin was passed in by the caller — they own the value then.
  useEffect(() => {
    if (payload && pinnedVersionId === undefined) {
      setPinnedVersionId(payload.version.id);
    }
  }, [payload, pinnedVersionId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {error ?? 'Unable to load per-entity view.'}
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        )}
      </Card>
    );
  }

  const v = payload.version;
  const distributedTotal = payload.outbound_edges.reduce(
    (s, e) => s + e.percentage,
    0,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {payload.entity_name}
              </h2>
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {payload.entity_type}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
              {payload.entity_id} · evaluated on{' '}
              {formatVersionDate(payload.evaluated_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onCompareToPrior && v.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCompareToPrior(v.id)}
            >
              <GitCompareArrows className="h-3.5 w-3.5 mr-1" />
              Compare to prior
            </Button>
          )}
          {onEditDraft && v.status === 'draft' && (
            <Button size="sm" onClick={() => onEditDraft(v.id)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit edges
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen((o) => !o)}
          >
            {historyOpen ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">
              {historyOpen ? 'Hide history' : 'Show history'}
            </span>
          </Button>
        </div>
      </div>

      {/* Version meta strip */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <VersionStatusBadge
            status={v.status}
            isInForce={
              payload.history.find((h) => h.version_id === v.id)?.is_in_force ??
              false
            }
            origin={v.origin}
            size="md"
          />
          <span className="text-sm text-foreground">
            v{v.id}
            {v.active_from ? ` · from ${formatVersionDate(v.active_from)}` : ''}
          </span>
          {v.activated_at && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              activated {formatVersionDateTime(v.activated_at)}
            </span>
          )}
          {v.copied_from_version_id !== null && (
            <span className="text-[11px] text-muted-foreground">
              copied from v{v.copied_from_version_id}
            </span>
          )}
        </div>
        {(v.rationale || '').trim() && (
          <p className="text-[12px] text-muted-foreground mt-2 leading-snug">
            {v.rationale}
          </p>
        )}
      </Card>

      <div className="flex gap-4 items-start">
        {/* Main column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Distribution shape — KPI strip */}
          {!payload.sums_within_100 && (
            <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Distribution exceeds 100%. Sum-rule per{' '}
                <span className="font-mono">[F-S1-02]</span> requires
                to-business + Σ edges ≤ 100%.
              </p>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile
              label="To-Business"
              value={formatPercent(payload.to_business_pct, {
                signed: false,
                decimals: 2,
              })}
              caption="Released from IT"
            />
            <KpiTile
              label="Distributed"
              value={formatPercent(distributedTotal, {
                signed: false,
                decimals: 2,
              })}
              caption={`${payload.outbound_edges.length} edge${payload.outbound_edges.length !== 1 ? 's' : ''}`}
            />
            <KpiTile
              label="Self-retained"
              value={formatPercent(payload.self_retained_pct, {
                signed: false,
                decimals: 2,
              })}
              caption="100 − to-business − Σ edges"
            />
            <KpiTile
              label="Effective cost"
              value={formatCurrencyDetailed(payload.effective_cost)}
              caption="Own + Σ inflows"
              icon={<Wallet className="h-3.5 w-3.5 text-muted-foreground" />}
            />
          </div>

          {/* Outbound edges table */}
          <Card>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Outbound edges
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stage 1 inter-service distribution per{' '}
                  <span className="font-mono">[F-S1-01]</span>. Per-edge
                  rationale per <span className="font-mono">[F-S1-05]</span>.
                </p>
              </div>
              {onEditDraft && v.status === 'draft' && (
                <Button size="sm" onClick={() => onEditDraft(v.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
            </div>
            {payload.outbound_edges.length === 0 ? (
              <EmptyState
                icon={ArrowRight}
                size="sm"
                title="No outbound edges"
                description="Costs flow either to business or stay self-retained for this version."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destination entity</TableHead>
                    <TableHead className="text-right w-[120px]">
                      Percentage
                    </TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.outbound_edges.map((edge) => (
                    <EdgeRow key={edge.id} edge={edge} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Inflows */}
          <Card>
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                Inflows · {formatCurrencyDetailed(payload.inflow_total)}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upstream contributions to this entity's effective cost.
              </p>
            </div>
            {payload.inflows.length === 0 ? (
              <EmptyState
                icon={ArrowRight}
                size="sm"
                title="No inflows"
                description="This entity has no upstream sources for the selected version."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source entity</TableHead>
                    <TableHead className="text-right w-[120px]">
                      Share
                    </TableHead>
                    <TableHead className="text-right w-[160px]">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.inflows.map((inflow) => (
                    <TableRow key={inflow.source_entity_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {inflow.source_entity_name}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {inflow.source_entity_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatPercent(inflow.percentage, {
                          signed: false,
                          decimals: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatCurrencyDetailed(inflow.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Own-cost provenance */}
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Own cost</p>
                <p className="text-lg font-mono text-foreground tabular-nums">
                  {formatCurrencyDetailed(payload.own_cost)}
                </p>
              </div>
              {payload.own_cost_source && (
                <p className="text-[11px] text-muted-foreground">
                  Source: {payload.own_cost_source}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* History sidebar */}
        {historyOpen && (
          <HistorySidebar
            entries={payload.history}
            currentVersionId={v.id}
            onPin={setPinnedVersionId}
          />
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon}
      </div>
      <p className="text-lg font-mono font-semibold text-foreground tabular-nums mt-1 truncate">
        {value}
      </p>
      {caption && (
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {caption}
        </p>
      )}
    </div>
  );
}

function EdgeRow({ edge }: { edge: DistributionEdgeItem }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {edge.destination_entity_name ?? edge.destination_entity_id}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {edge.destination_entity_id}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">
        {formatPercent(edge.percentage, { signed: false, decimals: 2 })}
      </TableCell>
      <TableCell>
        {(edge.rationale ?? '').trim() ? (
          <p className="text-[12px] text-foreground leading-snug">
            {edge.rationale}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            No rationale
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function HistorySidebar({
  entries,
  currentVersionId,
  onPin,
}: {
  entries: EntityStage1VersionEntry[];
  currentVersionId: number;
  onPin: (versionId: number) => void;
}) {
  const sorted = useMemo(() => {
    // Server already returns active_from desc; mirror defensively.
    return [...entries].sort((a, b) =>
      (b.active_from ?? '').localeCompare(a.active_from ?? ''),
    );
  }, [entries]);

  return (
    <aside className="w-[320px] flex-shrink-0">
      <Card>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Version history
          </h3>
        </div>
        {sorted.length === 0 ? (
          <EmptyState
            icon={History}
            size="sm"
            title="No history yet"
            description="No production versions for this entity."
          />
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((entry) => {
              const isCurrent = entry.version_id === currentVersionId;
              return (
                <li key={entry.version_id}>
                  <button
                    type="button"
                    onClick={() => onPin(entry.version_id)}
                    className={cn(
                      'w-full text-left p-3 hover:bg-accent transition-colors',
                      isCurrent && 'bg-primary/5 dark:bg-primary/10',
                    )}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <VersionStatusBadge
                        status={entry.status}
                        isInForce={entry.is_in_force}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-foreground">
                        v{entry.version_id}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] text-primary">
                          · viewing
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {entry.active_from
                        ? `from ${formatVersionDate(entry.active_from)}`
                        : 'unscheduled draft'}
                      {' · '}
                      {entry.edge_count_for_entity} edge
                      {entry.edge_count_for_entity !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {originLabel(entry.origin)}
                    </p>
                    {(entry.rationale || '').trim() && (
                      <p className="text-[11px] text-foreground/80 mt-1 leading-snug line-clamp-2">
                        {entry.rationale}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </aside>
  );
}
