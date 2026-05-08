/**
 * UtilizationDistributionCard — v5.2 W4 Track B (§11.3).
 *
 * Horizontal bar chart (histogram) showing how many people fall into each
 * utilization bucket. Computed client-side from the timeline person data
 * delivered by `useScopedTimelineData()`. Clicking a bar activates the
 * corresponding filter chip on the timeline.
 *
 * Buckets (top to bottom): >100%, 76–100%, 51–75%, 26–50%, 1–25%, 0%.
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
import { useMemo } from 'react';
import type { TooltipContentProps } from 'recharts';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';
import { useScopedTimelineData } from '../hooks/useScopedTimelineData';

// ---------------------------------------------------------------------------
// Bucket definitions
// ---------------------------------------------------------------------------

interface Bucket {
  key: string;
  label: string;
  /** Tailwind-compatible color reference (light + dark). Kept as a CSS var. */
  color: string;
  filter: FilterChipKey;
  /** Predicate on average utilization (0–100 scale, can exceed 100). */
  match: (avg: number) => boolean;
}

const BUCKETS: Bucket[] = [
  {
    key: 'over100',
    label: '>100%',
    color: 'var(--color-status-error, hsl(var(--destructive)))',
    filter: 'over_allocated',
    match: (a) => a > 100,
  },
  {
    key: 'b76_100',
    label: '76–100%',
    color: 'var(--color-status-warning, hsl(var(--chart-4)))',
    filter: 'all',
    match: (a) => a >= 76 && a <= 100,
  },
  {
    key: 'b51_75',
    label: '51–75%',
    color: 'var(--color-status-success, hsl(var(--chart-2)))',
    filter: 'all',
    match: (a) => a >= 51 && a < 76,
  },
  {
    key: 'b26_50',
    label: '26–50%',
    color: 'hsl(var(--chart-1))',
    filter: 'all',
    match: (a) => a >= 26 && a < 51,
  },
  {
    key: 'b1_25',
    label: '1–25%',
    color: 'hsl(var(--chart-5))',
    filter: 'under_utilized',
    match: (a) => a >= 1 && a < 26,
  },
  {
    key: 'b0',
    label: '0%',
    color: 'hsl(var(--muted-foreground))',
    filter: 'under_utilized',
    match: (a) => a === 0,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute each person's average utilization across the visible months,
 * then bucket them.
 */
function computeBuckets(
  data: ReturnType<typeof useScopedTimelineData>,
): { key: string; label: string; count: number; color: string; filter: FilterChipKey }[] {
  const people = [
    ...data.roleGroups.flatMap((g) => g.people),
    ...data.flatPeople,
  ];

  // Deduplicate by personId (roleGroups + flatPeople may overlap depending
  // on groupBy mode).
  const seen = new Set<string>();
  const unique = people.filter((p) => {
    if (seen.has(p.personId)) return false;
    seen.add(p.personId);
    return true;
  });

  const total = unique.length;

  return BUCKETS.map((b) => {
    let count = 0;
    for (const p of unique) {
      const cells = Object.values(p.cellsByMonth);
      if (cells.length === 0) {
        // Zero data → average is 0 → maps to the 0% bucket.
        if (b.match(0)) count++;
        continue;
      }
      const avg = cells.reduce((sum, c) => sum + c.utilization, 0) / cells.length;
      if (b.match(avg)) count++;
    }
    return { key: b.key, label: b.label, count, color: b.color, filter: b.filter, total };
  });
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface BucketPayload {
  key: string;
  label: string;
  count: number;
  total: number;
  filter: FilterChipKey;
}

function CustomTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = (payload[0] as { payload?: BucketPayload })?.payload;
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
  const { setActiveFilters } = useCapacityScope();
  const data = useScopedTimelineData();

  const bucketData = useMemo(() => computeBuckets(data), [data]);

  const handleClick = (entry: { filter: FilterChipKey }) => {
    if (entry.filter === 'all') {
      setActiveFilters(['all']);
    } else {
      setActiveFilters([entry.filter]);
    }
  };

  const hasData = bucketData.some((b) => b.count > 0);

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Utilization Distribution
      </p>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No data available for current scope
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
                  const bucket = barData?.payload as BucketPayload | undefined;
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
