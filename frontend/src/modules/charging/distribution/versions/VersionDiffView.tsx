/**
 * Version-diff report per FD-3 [F-S1-07].
 *
 * Compares two `DistributionVersion`s by identity. Default `compared_to`
 * is the version directly preceding by effective date (the one the
 * subject supersedes) — the server resolves this when
 * `compared_to_version_id` is omitted. The UI re-issues a fetch with
 * an explicit id when the user picks a different left-hand side.
 *
 * Edge rows are colour-coded per change kind:
 *
 * - **Added** — emerald (light + dark variants).
 * - **Removed** — slate-strikethrough.
 * - **Changed** — amber (light + dark variants) with old → new % and
 *   rationale deltas.
 *
 * European number formatting is applied via `formatPercent({ signed:
 * false, decimals: 2 })`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, MinusCircle, PencilLine, PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatPercent } from '@/lib/formatters';
import { chargingApi } from '@/api/endpoints';
import type {
  DistributionVersionDiff,
  DistributionVersionDiffEdge,
  DistributionVersionResponse,
} from '@/types/api';
import { VersionStatusBadge } from './VersionStatusBadge';
import { formatVersionDate, originLabel } from './versionLabels';

export interface VersionDiffViewProps {
  /** The right-hand-side (subject) version. */
  versionId: number;
  /** All known production versions — used for the LHS picker. */
  versions: DistributionVersionResponse[];
  /** Optional initial LHS — overrides the server's "previous-by-date" default. */
  initialComparedToVersionId?: number | null;
  /** Optional CTA to return to the parent list view. */
  onBack?: () => void;
}

const KIND_COLOR: Record<
  DistributionVersionDiffEdge['change_kind'],
  string
> = {
  added: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  removed: 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 line-through',
  changed: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const KIND_BADGE: Record<
  DistributionVersionDiffEdge['change_kind'],
  { label: string; cls: string }
> = {
  added: {
    label: 'Added',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  removed: {
    label: 'Removed',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-400',
  },
  changed: {
    label: 'Changed',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
};

function pct(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return formatPercent(value, { signed: false, decimals: 2 });
}

function pctDelta(oldP: number | null, newP: number | null): string | null {
  if (oldP === null || newP === null) return null;
  const delta = newP - oldP;
  return formatPercent(delta, { signed: true, decimals: 2 });
}

export function VersionDiffView({
  versionId,
  versions,
  initialComparedToVersionId = null,
  onBack,
}: VersionDiffViewProps) {
  const [diff, setDiff] = useState<DistributionVersionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparedToId, setComparedToId] = useState<number | null>(
    initialComparedToVersionId,
  );
  const [kindFilter, setKindFilter] = useState<
    'all' | DistributionVersionDiffEdge['change_kind']
  >('all');

  useEffect(() => {
    setLoading(true);
    setError(null);
    chargingApi
      .diffDistributionVersion(versionId, comparedToId ?? undefined)
      .then((d) => setDiff(d))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load diff'),
      )
      .finally(() => setLoading(false));
  }, [versionId, comparedToId]);

  const candidatesForLeft = useMemo(() => {
    // Any version that is not the subject. Defensive: scenario versions
    // already filtered out by the parent's listDistributionVersions call.
    return [...versions]
      .filter((v) => v.id !== versionId)
      .sort((x, y) => {
        if (x.status !== y.status) return x.status === 'active' ? -1 : 1;
        if (x.status === 'active') {
          return (y.active_from ?? '').localeCompare(x.active_from ?? '');
        }
        return y.id - x.id;
      });
  }, [versions, versionId]);

  const filteredChanges = useMemo(() => {
    if (!diff) return [];
    if (kindFilter === 'all') return diff.changes;
    return diff.changes.filter((c) => c.change_kind === kindFilter);
  }, [diff, kindFilter]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !diff) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {error ?? 'Diff unavailable.'}
        </p>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Back to list
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1 rotate-90" /> Back
            </Button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Version diff
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Per <span className="font-mono">[F-S1-07]</span>. Default
              comparison is the version this one supersedes by effective date.
            </p>
          </div>
        </div>
      </div>

      {/* Two-version selector card */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Compared-to version (left)
            </label>
            <Select
              value={String(diff.compared_to_version.id)}
              onValueChange={(v) => setComparedToId(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider">
                    Production versions
                  </SelectLabel>
                  {candidatesForLeft.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      v{v.id} ·{' '}
                      {v.status === 'active'
                        ? `Active from ${formatVersionDate(v.active_from)}`
                        : v.active_from
                          ? `Draft scheduled ${formatVersionDate(v.active_from)}`
                          : 'Draft (unscheduled)'}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <DiffVersionMeta version={diff.compared_to_version} />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Version (right — subject)
            </label>
            <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm">
              v{diff.version.id}
            </div>
            <DiffVersionMeta version={diff.version} />
          </div>
        </div>
      </Card>

      {/* Count tiles + kind filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <CountChip
            label="Added"
            count={diff.added_count}
            kind="added"
            active={kindFilter === 'added'}
            onClick={() =>
              setKindFilter(kindFilter === 'added' ? 'all' : 'added')
            }
          />
          <CountChip
            label="Removed"
            count={diff.removed_count}
            kind="removed"
            active={kindFilter === 'removed'}
            onClick={() =>
              setKindFilter(kindFilter === 'removed' ? 'all' : 'removed')
            }
          />
          <CountChip
            label="Changed"
            count={diff.changed_count}
            kind="changed"
            active={kindFilter === 'changed'}
            onClick={() =>
              setKindFilter(kindFilter === 'changed' ? 'all' : 'changed')
            }
          />
          <span className="text-[11px] text-muted-foreground ml-2">
            {diff.total === 0
              ? 'No differences — identical edge sets.'
              : `${diff.total} total change${diff.total !== 1 ? 's' : ''}`}
          </span>
          {kindFilter !== 'all' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto"
              onClick={() => setKindFilter('all')}
            >
              Clear filter
            </Button>
          )}
        </div>
      </Card>

      {/* Diff table */}
      <Card>
        {filteredChanges.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            size="sm"
            title={
              kindFilter === 'all'
                ? 'Identical edge sets'
                : `No ${kindFilter} edges`
            }
            description={
              kindFilter === 'all'
                ? 'Both versions hold the same edges with identical percentages and rationale.'
                : 'Switch filter or clear it to see other change kinds.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Change</TableHead>
                <TableHead>Source → Destination</TableHead>
                <TableHead className="text-right w-[120px]">Old %</TableHead>
                <TableHead className="text-right w-[120px]">New %</TableHead>
                <TableHead className="w-[330px]">Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChanges.map((c, i) => {
                const badge = KIND_BADGE[c.change_kind];
                const rowCls = KIND_COLOR[c.change_kind];
                return (
                  <TableRow
                    key={`${c.change_kind}-${c.source_entity_id}-${c.destination_entity_id}-${i}`}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
                      >
                        {c.change_kind === 'added' && (
                          <PlusCircle className="h-3 w-3" />
                        )}
                        {c.change_kind === 'removed' && (
                          <MinusCircle className="h-3 w-3" />
                        )}
                        {c.change_kind === 'changed' && (
                          <PencilLine className="h-3 w-3" />
                        )}
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className={`flex flex-col ${c.change_kind === 'removed' ? 'opacity-70' : ''}`}>
                        <span className="text-sm text-foreground">
                          {c.source_entity_name ?? c.source_entity_id}
                          {' → '}
                          {c.destination_entity_name ?? c.destination_entity_id}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {c.source_entity_id} → {c.destination_entity_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm tabular-nums ${rowCls}`}
                    >
                      {pct(c.old_percentage)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm tabular-nums ${
                        c.change_kind === 'removed' ? rowCls : ''
                      }`}
                    >
                      {pct(c.new_percentage)}
                      {c.change_kind === 'changed' && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                          {pctDelta(c.old_percentage, c.new_percentage)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <RationaleDelta
                        oldRationale={c.old_rationale}
                        newRationale={c.new_rationale}
                        kind={c.change_kind}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function DiffVersionMeta({
  version,
}: {
  version: DistributionVersionResponse;
}) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <VersionStatusBadge
          status={version.status}
          origin={version.origin}
          size="sm"
        />
        <span className="text-[11px] text-muted-foreground">
          {version.active_from
            ? `Active from ${formatVersionDate(version.active_from)}`
            : 'Unscheduled draft'}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {(version.rationale || '').trim() || 'No rationale recorded'}
      </p>
      <p className="text-[10px] text-muted-foreground/80 font-mono">
        Origin: {originLabel(version.origin)}
        {version.copied_from_version_id !== null && (
          <> · copied from v{version.copied_from_version_id}</>
        )}
      </p>
    </div>
  );
}

function CountChip({
  label,
  count,
  kind,
  active,
  onClick,
}: {
  label: string;
  count: number;
  kind: DistributionVersionDiffEdge['change_kind'];
  active: boolean;
  onClick: () => void;
}) {
  const badge = KIND_BADGE[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${badge.cls} ${
        active ? 'ring-2 ring-primary/40' : ''
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="font-mono tabular-nums">{count}</span>
    </button>
  );
}

function RationaleDelta({
  oldRationale,
  newRationale,
  kind,
}: {
  oldRationale: string | null;
  newRationale: string | null;
  kind: DistributionVersionDiffEdge['change_kind'];
}) {
  if (kind === 'added') {
    return (
      <p className="text-[11px] text-foreground">
        {newRationale?.trim() || (
          <span className="text-muted-foreground italic">No rationale</span>
        )}
      </p>
    );
  }
  if (kind === 'removed') {
    return (
      <p className="text-[11px] text-muted-foreground line-through">
        {oldRationale?.trim() || (
          <span className="italic">No rationale</span>
        )}
      </p>
    );
  }
  // changed — show old → new only if the text actually differs
  const o = oldRationale?.trim() ?? '';
  const n = newRationale?.trim() ?? '';
  if (o === n) {
    return (
      <p className="text-[11px] text-foreground">
        {n || <span className="text-muted-foreground italic">No change</span>}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground line-through">
        {o || <span className="italic">No rationale</span>}
      </p>
      <p className="text-[11px] text-foreground">
        {n || <span className="text-muted-foreground italic">No rationale</span>}
      </p>
    </div>
  );
}
