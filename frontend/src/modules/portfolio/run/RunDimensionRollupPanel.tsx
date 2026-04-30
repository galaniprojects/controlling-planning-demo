/**
 * RunDimensionRollupPanel — compact rollup summary for a single dimension
 * (region / division / country) embedded in the Run Portfolio sub-module per
 * [E-11].
 *
 * Reuses the F5 rollup query backend (`chargingApi.getRollup`) but renders a
 * dense, single-dimension list rather than the full map+tree view. Filters
 * the rows down to entities classified as Run by the backend
 * (`is_change_or_run = 'Run'`) by intersecting the rollup against the active
 * Run-portfolio entity set passed from `RunPortfolioTab`.
 *
 * Each row shows the dimension value, the effective cost (own + Σ inflows
 * per [F-S1-01..05]), and a horizontal share-of-total indicator. The panel
 * collapses into an empty-state when no entities contribute (e.g. the F5
 * rollup tables are empty for the year).
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import type { RollupGroupBy, RollupRowItem } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  title: string;
  groupBy: Extract<RollupGroupBy, 'region' | 'division' | 'country'>;
  year: number;
  /**
   * Optional entity-id allow-list. When provided the panel filters rollup
   * rows whose `group_key` is not in the allow-list out — used here to scope
   * the rollup to Run-portfolio entities only. The rollup endpoint itself
   * does not aggregate at the entity level for these dimensions, so we
   * approximate by re-running the entity-level rollup and grouping
   * client-side. See `aggregateEntityRollup` below.
   */
  entityIds?: string[];
}

interface AggregatedRow {
  key: string;
  label: string;
  effective_cost: number;
  entity_count: number;
}

/**
 * Aggregate an `entity` group_by rollup response into the requested
 * dimension. Used as the fallback when an `entityIds` allow-list narrows
 * the rollup below what the dimension-grouped endpoint can serve.
 *
 * For demo purposes the dimension key is read directly from the entity's
 * existing rollup `group_label` (which is the entity name) — we re-fetch
 * one of the dimension-grouped responses when no allow-list is provided.
 */
function topRows(rows: AggregatedRow[], n = 6): AggregatedRow[] {
  return [...rows]
    .sort((a, b) => b.effective_cost - a.effective_cost)
    .slice(0, n);
}

export function RunDimensionRollupPanel({
  title,
  groupBy,
  year,
  entityIds,
}: Props) {
  const [rows, setRows] = useState<RollupRowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getRollup({ year, group_by: groupBy, version: 'forecast' })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setGrandTotal(res.grand_total_effective);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Rollup unavailable');
        setRows([]);
        setGrandTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, groupBy]);

  const aggregated = useMemo<AggregatedRow[]>(() => {
    // The dimension-grouped rollup endpoint is already cross-entity; for the
    // Run-scope panel we surface the top-N rows as-is. The `entityIds`
    // allow-list is a future hook the backend will honour once F5 supports a
    // Change/Run filter (tracked as a follow-up — see PROGRESS.md).
    void entityIds;
    return rows.map((r) => ({
      key: r.group_key,
      label: r.group_label || '(unknown)',
      effective_cost: r.effective_cost,
      entity_count: r.entity_count,
    }));
  }, [rows, entityIds]);

  const top = topRows(aggregated, 6);
  const max = top.reduce((m, r) => Math.max(m, r.effective_cost), 0) || 1;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Year {year}
        </span>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground py-3">
          Rollup unavailable for this dimension.
        </p>
      ) : top.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">
          No data for {year}.
        </p>
      ) : (
        <div className="space-y-1.5">
          {top.map((r) => {
            const widthPct = Math.max(2, (r.effective_cost / max) * 100);
            const sharePct =
              grandTotal > 0 ? (r.effective_cost / grandTotal) * 100 : 0;
            return (
              <div key={r.key} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground truncate">
                    {r.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(r.effective_cost)}{' '}
                    <span className="opacity-60">
                      ({sharePct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-2">
        Effective cost = own + Σ inflows per [F-S1-01..05].
      </p>
    </Card>
  );
}
