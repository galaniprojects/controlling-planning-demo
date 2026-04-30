/**
 * Workbench Overview tile (3,1) — External Costs per `[E-04b]` `[E-08]`.
 *
 * Total external spend, mini stacked bar by category, category legend.
 * Click target: External Costs tab (Workbench surface from E-08, owned by
 * T1 in this wave). Until that tab lands, the parent OverviewTab can
 * route this click to the Forecast & Planning tab as a graceful interim.
 *
 * **API note:** the typed `externalCostsApi` wrapper is owned by T1.
 * To keep the two teammates from racing on `endpoints.ts`, this tile
 * calls the backend route directly via the `api` client. When T1 adds
 * the wrapper, this tile can be migrated in a one-line change.
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { api } from '@/api/client';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  onClick?: () => void;
}

interface VendorRow {
  vendor_name: string;
  expense_cost_type: string;
  forecast_total: number;
  actuals_total: number;
  baseline_total: number;
  remaining: number;
  variance: number;
  po_count: number;
  line_count: number;
}

interface CategoryRow {
  cost_type_id: string;
  cost_type_name: string;
  forecast_total: number;
  actuals_total: number;
  baseline_total: number;
  remaining: number;
  variance: number;
  vendor_count: number;
}

interface VendorSummaryResponse {
  items: VendorRow[];
  total: number;
  project_id: string;
  year: number | null;
}

interface CategoryRollupResponse {
  items: CategoryRow[];
  total: number;
  project_id: string;
  year: number | null;
}

/** Stable, modest palette mapped by cost-type slot. */
const CATEGORY_COLORS = [
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-fuchsia-500',
];

export function ExternalCostsTile({ projectId, onClick }: Props) {
  const [vendors, setVendors] = useState<VendorRow[] | null>(null);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api
        .get<VendorSummaryResponse>(
          `/api/projects/${projectId}/external-costs/vendor-summary`,
        )
        .catch(() => null),
      api
        .get<CategoryRollupResponse>(
          `/api/projects/${projectId}/external-costs/category-rollup`,
        )
        .catch(() => null),
    ])
      .then(([vs, cs]) => {
        if (cancelled) return;
        setVendors(vs?.items ?? []);
        setCategories(cs?.items ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const totalForecast = (categories ?? []).reduce(
    (acc, c) => acc + c.forecast_total,
    0,
  );
  const totalActuals = (categories ?? []).reduce(
    (acc, c) => acc + c.actuals_total,
    0,
  );

  const sortedCategories = (categories ?? [])
    .slice()
    .sort((a, b) => b.forecast_total - a.forecast_total);

  const isEmpty =
    !loading && !error && (!sortedCategories.length || totalForecast === 0);

  return (
    <ActionCard
      title="External costs"
      onClick={onClick}
      loading={loading}
      error={error}
      isEmpty={isEmpty}
      emptyState="No external spend on this project."
    >
      {!isEmpty && !loading && !error && (
        <div className="mt-3 space-y-3">
          {/* Headline */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total external (forecast)
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {formatCurrency(totalForecast)}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Actuals YTD {formatCurrency(totalActuals)}
              {vendors && vendors.length > 0 ? ` · ${vendors.length} vendor${vendors.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>

          {/* Mini stacked bar */}
          <div
            className="flex h-2 rounded-full overflow-hidden"
            role="img"
            aria-label="External spend by category"
          >
            {sortedCategories.map((c, idx) => {
              if (c.forecast_total <= 0) return null;
              const pct = (c.forecast_total / totalForecast) * 100;
              return (
                <div
                  key={c.cost_type_id || c.cost_type_name}
                  className={cn(
                    'h-full',
                    CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                  )}
                  style={{ width: `${pct}%` }}
                  title={`${c.cost_type_name}: ${formatCurrency(c.forecast_total)} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>

          {/* Legend (top 3 categories) */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {sortedCategories.slice(0, 3).map((c, idx) => (
              <div
                key={c.cost_type_id || c.cost_type_name}
                className="flex items-center gap-1"
              >
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full',
                    CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                  )}
                />
                <span className="text-muted-foreground truncate max-w-[100px]">
                  {c.cost_type_name}
                </span>
                <span className="text-foreground tabular-nums">
                  {((c.forecast_total / totalForecast) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ActionCard>
  );
}
