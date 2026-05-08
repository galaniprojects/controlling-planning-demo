/**
 * CapacityForecastCard — v5.2 W4 Track B (§11.4).
 *
 * Area chart with three series:
 *   1. Available capacity (solid line, neutral fill below)
 *   2. Allocated hours   (solid line, blue fill below)
 *   3. Incoming demand   (dashed line, no fill)
 *
 * Gap shading: green when Available greater than Allocated (surplus);
 * allocated area shaded red when Allocated exceeds Available (deficit).
 *
 * Data source: getDashboardForecast({scope, start, end}).
 *
 * Click month: dispatches CustomEvent('capacity:expand-month', {detail:{month}}).
 * This wiring is documented as deferred (timeline side belongs to W5 S6b polish).
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.4
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { capacityApi } from '@/api/endpoints';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import type { DashboardForecastPoint } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format ISO month string (YYYY-MM) as 3-letter abbreviation. */
function monthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

/** Abbreviate large hour values: 2400 to "2.4k". */
function abbrevHours(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(1).replace('.0', '')}k`;
  return String(Math.round(h));
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface ChartPoint {
  month: string;
  available_hours: number;
  allocated_hours: number;
  demand_hours: number;
}

function CustomTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length || !label) return null;
  const d = payload.find((p: { dataKey?: string }) => p.dataKey === 'available_hours');
  const a = payload.find((p: { dataKey?: string }) => p.dataKey === 'allocated_hours');
  const dem = payload.find((p: { dataKey?: string }) => p.dataKey === 'demand_hours');
  const avail = (d?.value as number) ?? 0;
  const alloc = (a?.value as number) ?? 0;
  const demand = (dem?.value as number) ?? 0;
  const gap = avail - alloc;
  const gapStr =
    gap >= 0
      ? `+${abbrevHours(gap)}h surplus`
      : `${abbrevHours(Math.abs(gap))}h deficit`;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        Available: <span className="text-foreground">{abbrevHours(avail)}h</span>
      </p>
      <p className="text-muted-foreground">
        Allocated: <span className="text-foreground">{abbrevHours(alloc)}h</span>
      </p>
      <p className="text-muted-foreground">
        Demand: <span className="text-foreground">{abbrevHours(demand)}h</span>
      </p>
      <p
        className={
          gap >= 0
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400'
        }
      >
        {gapStr}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CapacityForecastCard() {
  const { scope, ccId } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);

  const [items, setItems] = useState<DashboardForecastPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    capacityApi
      .getDashboardForecast(apiScope)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load forecast');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiScope]);

  const chartData: ChartPoint[] = useMemo(
    () =>
      items.map((pt) => ({
        ...pt,
        month: monthLabel(pt.month),
      })),
    [items],
  );

  // CategoricalChartFunc signature: (nextState: MouseHandlerDataParam, event) => void
  // activeIndex from MouseHandlerDataParam may be TooltipIndex. We coerce to number.
  const handleChartClick = (data: { activeIndex?: unknown }) => {
    const idx = typeof data?.activeIndex === 'number' ? data.activeIndex : null;
    if (idx == null) return;
    const rawMonth = items[idx]?.month;
    if (rawMonth) {
      window.dispatchEvent(
        new CustomEvent('capacity:expand-month', { detail: { month: rawMonth } }),
      );
    }
  };

  const hasData = chartData.length > 0;

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Capacity Forecast
      </p>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-1 items-center justify-center text-xs text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No forecast data available
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              onClick={handleChartClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-grid, var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{
                  fontSize: 10,
                  fill: 'var(--chart-axis, var(--muted-foreground))',
                }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{
                  fontSize: 10,
                  fill: 'var(--chart-axis, var(--muted-foreground))',
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={abbrevHours}
                width={32}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={CustomTooltip as any} />

              {/* Available capacity — neutral/gray fill, sits behind allocated */}
              <Area
                type="monotone"
                dataKey="available_hours"
                stroke="var(--color-text-tertiary, var(--muted-foreground))"
                strokeWidth={1.5}
                fill="rgba(34,197,94,0.12)"
                fillOpacity={1}
                dot={false}
                activeDot={false}
                legendType="none"
              />

              {/* Allocated hours — blue fill */}
              <Area
                type="monotone"
                dataKey="allocated_hours"
                stroke="var(--color-text-info, hsl(var(--chart-1)))"
                strokeWidth={1.5}
                fill="rgba(99,102,241,0.18)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 3 }}
              />

              {/* Demand — dashed line, no fill */}
              <Line
                type="monotone"
                dataKey="demand_hours"
                stroke="var(--color-text-warning, hsl(var(--chart-4)))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Inline legend */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1">
            <LegendItem
              color="var(--muted-foreground)"
              dashed={false}
              label="Available"
            />
            <LegendItem
              color="hsl(var(--chart-1))"
              dashed={false}
              label="Allocated"
            />
            <LegendItem
              color="hsl(var(--chart-4))"
              dashed
              label="Demand"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <svg width="20" height="8" className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default CapacityForecastCard;
