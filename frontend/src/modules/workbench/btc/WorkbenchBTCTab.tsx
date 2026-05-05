/**
 * Workbench BTC tab per [E-09] (Wave 4 Session F6).
 *
 * Three sections:
 *   1. Profile editor — refactored EntityBTCProfileEditor mounted with
 *      (entityId, year). Falls back to a "no profile" panel when none yet.
 *   2. Allocation breakdown — sortable table of charging locations with
 *      percentage + € amount + region/country/division metadata. Click a
 *      row to drill into upstream-cost contributors.
 *   3. Audit history — per-entity audit trail via
 *      adminApi.getEntityAuditTrail('chargeable_entity', entityId).
 *
 * For internal services with `to_business_pct === 0` the tab automatically
 * falls back to the Distribution editor (already entity-keyed).
 *
 * v5 Wave 5 F7 [E-11]: the tab now accepts an alternative `entityId` prop
 * for the Run-portfolio drill-down on Offerings + InternalServices. When
 * `entityId` is provided the tab fetches the entity directly via
 * `chargingApi.getEntity(id)` instead of the project-keyed lookup. Exactly
 * one of `projectId` / `entityId` should be supplied.
 */
import { useEffect, useState } from 'react';
import {
  ArrowUpDown, ArrowUp, ArrowDown, History, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { Badge } from '@/components/ui/badge';
import { LocationLabel } from '@/components/shared/LocationLabel';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EntityBTCProfileEditor } from '@/modules/charging/btc/EntityBTCProfileEditor';
import { EntityDistributionEditor } from '@/modules/charging/distribution/EntityDistributionEditor';
import { chargingApi, adminD3Api } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type {
  AllocationBreakdownSortBy,
  AuditEntryV2,
  ChargeableEntityItem,
  EntityAllocationBreakdownResponse,
  EntityAllocationBreakdownRow,
  RollupDrillDownResponse,
} from '@/types/api';

interface Props {
  /** Project entry-point — resolves the linked ChargeableEntity by project id. */
  projectId?: string;
  /**
   * Entity entry-point (Wave 5 F7 [E-11]) — resolves the ChargeableEntity
   * directly by id. Used for the Run-portfolio drill-down on Offerings and
   * InternalServices, which do not have a backing project. Exactly one of
   * `projectId` or `entityId` should be provided.
   */
  entityId?: string;
}

export function WorkbenchBTCTab({ projectId, entityId }: Props) {
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const promise = entityId
      ? chargingApi.getEntity(entityId)
      : projectId
        ? chargingApi.getEntityByProjectId(projectId)
        : Promise.reject(new Error('Either projectId or entityId is required'));
    promise
      .then((ent) => {
        if (!cancelled) setEntity(ent);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Load failed';
        if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
          setEntity(null);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, entityId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400 mt-0.5" />
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </Card>
    );
  }

  if (!entity) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1">
          No charging entity
        </h3>
        <p className="text-xs text-muted-foreground">
          This project does not yet have a linked ChargeableEntity. The cost
          allocation module creates one when the project transitions to a
          stage that requires charging configuration.
        </p>
      </Card>
    );
  }

  // Distribution-only fallback: when to_business_pct is 0, route to the
  // Distribution editor instead. Internal services and offerings with no
  // To-Business share land here.
  if ((entity.to_business_pct ?? 0) === 0) {
    return (
      <div className="space-y-3">
        <Card className="border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            This entity has no business charging share — costs flow internally
            via Stage 1 distribution. Configure the outgoing edges below.
          </p>
        </Card>
        <EntityDistributionEditor
          entityId={entity.id}
          year={year}
          version="forecast"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile editor */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          BTC Profile
        </h2>
        <EntityBTCProfileEditor
          entityId={entity.id}
          year={year}
        />
      </section>

      {/* Allocation breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Allocation breakdown · {year}
        </h2>
        <AllocationBreakdownTable entityId={entity.id} year={year} />
      </section>

      {/* Audit history */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Audit history
        </h2>
        <BTCAuditHistory entityId={entity.id} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocation breakdown table — sortable + drill-down
// ---------------------------------------------------------------------------

interface BreakdownTableProps {
  entityId: string;
  year: number;
}

const SORTABLE_COLUMNS: Array<{
  key: AllocationBreakdownSortBy;
  label: string;
  align?: 'left' | 'right';
}> = [
  { key: 'location', label: 'Charging location', align: 'left' },
  { key: 'region', label: 'Region', align: 'left' },
  { key: 'country', label: 'Country', align: 'left' },
  { key: 'division', label: 'Division', align: 'left' },
  { key: 'percentage', label: '%', align: 'right' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

function AllocationBreakdownTable({ entityId, year }: BreakdownTableProps) {
  const [data, setData] = useState<EntityAllocationBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<AllocationBreakdownSortBy>('amount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drillRow, setDrillRow] = useState<EntityAllocationBreakdownRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    chargingApi
      .getEntityAllocationBreakdown({
        entity_id: entityId,
        year,
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, year, sortBy, sortDir]);

  const toggleSort = (key: AllocationBreakdownSortBy) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'amount' || key === 'percentage' ? 'desc' : 'asc');
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Failed to load allocation breakdown.
        </p>
      </Card>
    );
  }
  if (!data.has_profile) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          No BTC profile yet for {data.year}.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data.rows.length} location{data.rows.length !== 1 ? 's' : ''} ·
          {' '}
          To-Business total{' '}
          <span className="font-mono text-foreground">
            {formatCurrency(data.business_amount_total)}
          </span>
        </div>
        <Badge
          variant="outline"
          className={
            data.sums_to_100
              ? 'text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400'
              : 'text-[10px] border-amber-500 text-amber-700 dark:text-amber-400'
          }
        >
          {data.sums_to_100 ? 'Σ 100%' : 'Σ ≠ 100%'}
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {SORTABLE_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className={
                  (col.align === 'right' ? 'text-right ' : '') +
                  'cursor-pointer select-none'
                }
                onClick={() => toggleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.key === 'location' ? (
                    <LocationLabel kind="charging" text={col.label} />
                  ) : (
                    col.label
                  )}
                  <SortIndicator
                    active={sortBy === col.key}
                    dir={sortBy === col.key ? sortDir : undefined}
                  />
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={SORTABLE_COLUMNS.length}
                className="text-center text-sm text-muted-foreground py-12"
              >
                No allocation rows.
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((row) => (
              <TableRow
                key={row.charging_location_id}
                className="cursor-pointer hover:bg-accent"
                onClick={() => setDrillRow(row)}
              >
                <TableCell>
                  <div className="text-sm font-medium text-foreground">
                    {row.charging_location_name ?? row.charging_location_id}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {row.charging_location_code ?? '—'}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.region_name ?? '—'}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {row.country_iso_code ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.division ?? '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.percentage.toFixed(2)}%
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                  {formatCurrency(row.amount_eur)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DrillDownDialog
        open={drillRow !== null}
        row={drillRow}
        entityId={entityId}
        year={year}
        onClose={() => setDrillRow(null)}
      />
    </Card>
  );
}

function SortIndicator({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  if (!active) {
    return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
  }
  return dir === 'asc' ? (
    <ArrowUp className="h-3 w-3 text-foreground" />
  ) : (
    <ArrowDown className="h-3 w-3 text-foreground" />
  );
}

// ---------------------------------------------------------------------------
// Drill-down dialog — uses /rollup/charging-location/{cl_id}
// ---------------------------------------------------------------------------

interface DrillProps {
  open: boolean;
  row: EntityAllocationBreakdownRow | null;
  entityId: string;
  year: number;
  onClose: () => void;
}

function DrillDownDialog({ open, row, entityId, year, onClose }: DrillProps) {
  const [data, setData] = useState<RollupDrillDownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) {
      setData(null);
      setErr(null);
      return;
    }
    setLoading(true);
    chargingApi
      .getRollupDrillDown({
        cl_id: row.charging_location_id,
        entity_id: entityId,
        year,
      })
      .then(setData)
      .catch((e: unknown) =>
        setErr(e instanceof Error ? e.message : 'Drill failed'),
      )
      .finally(() => setLoading(false));
  }, [open, row, entityId, year]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row?.charging_location_name ?? 'Charging location'}
          </DialogTitle>
          <DialogDescription>
            Upstream cost contributions · {row?.charging_location_code ?? '—'}
          </DialogDescription>
        </DialogHeader>

        {loading && <Skeleton className="h-32 w-full" />}
        {err && (
          <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-800 dark:text-red-300">{err}</p>
          </Card>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] uppercase text-muted-foreground">
                  Effective cost
                </label>
                <p className="font-mono text-sm tabular-nums">
                  {formatCurrency(data.effective_cost)}
                </p>
              </div>
              <div>
                <label className="block text-[11px] uppercase text-muted-foreground">
                  Own cost
                </label>
                <p className="font-mono text-sm tabular-nums">
                  {formatCurrency(data.own_cost)}
                </p>
              </div>
              <div>
                <label className="block text-[11px] uppercase text-muted-foreground">
                  Inflow total
                </label>
                <p className="font-mono text-sm tabular-nums">
                  {formatCurrency(data.inflow_total)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1">
                Upstream paths ({data.paths.length})
              </h4>
              {data.paths.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No upstream contributors — cost is entirely the entity's own.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.paths.slice(0, 8).map((path, i) => (
                    <li
                      key={i}
                      className="font-mono text-muted-foreground truncate"
                    >
                      {path.path_labels.join(' → ')}
                    </li>
                  ))}
                  {data.paths.length > 8 && (
                    <li className="text-muted-foreground italic">
                      … {data.paths.length - 8} more paths
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Audit history section
// ---------------------------------------------------------------------------

function BTCAuditHistory({ entityId }: { entityId: string }) {
  const [items, setItems] = useState<AuditEntryV2[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminD3Api
      .getEntityAuditTrail('chargeable_entity', entityId, 25)
      .then((res) => {
        if (!cancelled) setItems(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!items || items.length === 0) {
    return (
      <Card className="p-4 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No audit entries yet for this entity.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                {new Date(row.timestamp).toLocaleString('en-GB')}
              </TableCell>
              <TableCell className="text-xs">
                {row.user_name ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {row.action}
                </Badge>
              </TableCell>
              <TableCell className="text-xs font-mono text-muted-foreground">
                {row.field_changed ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                {row.old_value || row.new_value ? (
                  <span className="font-mono text-muted-foreground">
                    {row.old_value ?? '∅'} → {row.new_value ?? '∅'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// Type-only re-export for tooling that references it.
export type { Props as WorkbenchBTCTabProps };
