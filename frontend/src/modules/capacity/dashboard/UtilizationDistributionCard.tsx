/**
 * UtilizationDistributionCard — v5.2 W4 Track B (§11.3).
 *
 * Horizontal bar chart (histogram) showing how many people fall into each
 * utilization bucket. Buckets (top to bottom): >100%, 76–100%, 51–75%,
 * 26–50%, 1–25%, 0%. Click a bar → activate the corresponding filter chip.
 *
 * Data source: GET /api/capacity/dashboard/utilization-distribution
 * (added in W4 P1 fix). The original spec proposed client-side aggregation
 * from `useScopedTimelineData`, but that hook returns no data at multi-CC
 * scope (the only scope where the dashboard is visible per §11.1), so the
 * server-side endpoint computes per-person averages and bucket counts.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.3
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import type { TooltipContentProps } from 'recharts';
import { capacityApi } from '@/api/endpoints';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import type { UtilizationBucketKey } from '@/types/api';

// ---------------------------------------------------------------------------
// Bucket definitions (display order: top → bottom in the vertical chart)
// ---------------------------------------------------------------------------

interface BucketMeta {
  key: UtilizationBucketKey;
  label: string;
  /** Tailwind-compatible color reference (light + dark). */
  color: string;
  filter: FilterChipKey;
}

// Spec §11.3 prescribes specific colors per bucket. The theme uses oklch()
// chart vars that don't map cleanly to the red/amber/green/blue/lighter-blue/
// gray palette spec'd here, so use stable Tailwind hex values that read
// correctly in both light and dark themes.
const BUCKETS: BucketMeta[] = [
  { key: 'over_100', label: '>100%',  color: '#ef4444', filter: 'over_allocated' }, // red-500
  { key: '76_100',   label: '76–100%', color: '#f59e0b', filter: 'all' },            // amber-500
  { key: '51_75',    label: '51–75%',  color: '#22c55e', filter: 'all' },            // green-500
  { key: '26_50',    label: '26–50%',  color: '#3b82f6', filter: 'all' },            // blue-500
  { key: '1_25',     label: '1–25%',   color: '#93c5fd', filter: 'under_utilized' }, // blue-300
  { key: 'zero',     label: '0%',      color: '#9ca3af', filter: 'under_utilized' }, // gray-400
];

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface ChartRow {
  key: UtilizationBucketKey;
  label: string;
  count: number;
  color: string;
  filter: FilterChipKey;
  total: number;
}

function CustomTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = (payload[0] as { payload?: ChartRow })?.payload;
  if (!item) return null;
  const pct = item.total > 0 ? ((item.count / item.total) * 100).toFixed(0) : '0';
  return (
    <div
      className="rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow-md"
      style={{ color: 'var(--foreground)' }}
    >
      <span className="font-medium">{item.label}:</span> {item.count} people ({pct}%)
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UtilizationDistributionCard() {
  const { scope, ccId, setActiveFilters } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);

  const [counts, setCounts] = useState<Record<UtilizationBucketKey, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    capacityApi
      .getDashboardUtilizationDistribution(apiScope)
      .then((res) => {
        if (cancelled) return;
        const next = {
          zero: 0,
          '1_25': 0,
          '26_50': 0,
          '51_75': 0,
          '76_100': 0,
          over_100: 0,
        } as Record<UtilizationBucketKey, number>;
        for (const row of res.items ?? []) {
          next[row.bucket] = row.count;
        }
        setCounts(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load distribution');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiScope]);

  const bucketData = useMemo<ChartRow[]>(() => {
    const total = counts
      ? Object.values(counts).reduce((s, n) => s + n, 0)
      : 0;
    return BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts?.[b.key] ?? 0,
      color: b.color,
      filter: b.filter,
      total,
    }));
  }, [counts]);

  const handleClick = (entry: { filter: FilterChipKey }) => {
    setActiveFilters(entry.filter === 'all' ? ['all'] : [entry.filter]);
  };

  const hasData = bucketData.some((b) => b.count > 0);

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Utilization Distribution
      </p>

      {error ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Could not load distribution
        </div>
      ) : loading && !counts ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : !hasData ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No people in current scope
        </div>
      ) : (
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={bucketData}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--chart-axis, var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={52}
                tick={{ fontSize: 11, fill: 'var(--chart-axis, var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={CustomTooltip as any} cursor={{ fill: 'var(--accent)', opacity: 0.3 }} />
              <Bar
                dataKey="count"
                radius={[0, 3, 3, 0]}
                cursor="pointer"
                onClick={(barData) => {
                  const bucket = barData?.payload as ChartRow | undefined;
                  if (bucket) handleClick(bucket);
                }}
              >
                {bucketData.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{
                    fontSize: 11,
                    fill: 'var(--muted-foreground)',
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default UtilizationDistributionCard;
