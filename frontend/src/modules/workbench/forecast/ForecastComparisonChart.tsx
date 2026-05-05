/**
 * ForecastComparisonChart — three-point baseline / forecast / actuals
 * comparison chart rendered below the mixed-granularity F&P grid
 * per v5.1 [C-04].
 *
 * Two views toggle between:
 *
 *   1. **Monthly (default)** — grouped bar chart with three bars per month
 *      (Baseline grey, Forecast blue, Actuals green). Past months where
 *      actuals exceed forecast get a red "overrun" dot above the actuals
 *      bar. Elapsed months get a subtle background tint.
 *
 *   2. **Cumulative** — line chart with the same three series accumulating
 *      month-over-month, plus a red dashed `Budget Ceiling` reference line
 *      at the total baseline.
 *
 * Below the months a thin phase strip echoes the milestone palette so the
 * chart's time axis carries the same phase context as the grid above.
 *
 * Lockstep scroll seam — when the parent passes the F&P grid's scroll
 * container ref via `scrollContainerRef`, the chart mirrors `scrollLeft`
 * bidirectionally so the two surfaces stay aligned on the same time axis.
 *
 * Cluster C / Wave 3 / Teammate B file ownership.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip as ShadTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatCurrencyCompact,
  formatPercent,
} from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import { milestonesApi } from '@/api/endpoints';
import { isElapsedMonth } from '@/lib/yearColumns';
import type { MixedGridResponse } from '@/types/api';
import type { MilestoneResponse } from '@/types/milestones';

interface Props {
  projectId: string;
  /** Ref to the F&P grid's scroll container — enables lockstep scroll. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

// Mirror MixedGranularityGrid line 80 — the demo "today" date.
const DEMO_DATE = '2026-04';

// Spec-mandated colours for the three series.
const COLOR_BASELINE = '#cbd5e1'; // gray
const COLOR_FORECAST = '#3b82f6'; // blue
const COLOR_ACTUALS = '#059669'; // green
const COLOR_OVERRUN = '#dc2626'; // red — overrun dots & today line

// Pixel width per month column. The grid's monthly columns are min-w-[90px]
// so this is a tight match; lockstep scroll uses scrollLeft which only needs
// approximate alignment.
const PX_PER_MONTH = 90;
// Bar chart inset: Recharts adds left margin for the Y axis labels — keep
// in sync between content width calc and the actual chart margin so the
// scroll math lines up.
const Y_AXIS_WIDTH = 64;
const RIGHT_MARGIN = 16;
const BOTTOM_MARGIN = 8;
const TOP_MARGIN = 16;
const CHART_HEIGHT = 260;
const PHASE_STRIP_HEIGHT = 18;
const DEFAULT_LOOKBACK_VIEW = 3; // months before demo_date in initial scroll

interface ChartRow {
  month: string; // 'YYYY-MM'
  baseline: number;
  forecast: number;
  actuals: number;
  /** Cumulative running totals, used by the cumulative-view chart. */
  baseline_cum: number;
  forecast_cum: number;
  actuals_cum: number;
  /** True when the month is past demo_date AND actuals > forecast. */
  overrun: boolean;
}

interface PhaseSegment {
  start: string;
  end: string;
  name: string;
  color: string;
  baselineStart: string;
  baselineEnd: string;
  slipMonths: number;
}

function monthIndex(month: string): number {
  // 'YYYY-MM' → integer ordinal so we can compute month spans.
  const [y, m] = month.split('-').map((s) => parseInt(s, 10));
  return y * 12 + (m - 1);
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function clampToRangeIndex(
  monthOrdinal: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  if (monthOrdinal < rangeStart) return rangeStart;
  if (monthOrdinal > rangeEnd) return rangeEnd;
  return monthOrdinal;
}

function aggregateGrid(grid: MixedGridResponse): ChartRow[] {
  // Sum across all rows per monthly column. Quarterly columns are skipped
  // because the chart axis is monthly (we always request granularity=monthly
  // server-side). Also pull baseline_amount_eur + actuals_amount_eur from
  // the C-08 overlay payload.
  const monthlyKeys = grid.columns
    .filter((c) => c.cell_type === 'monthly')
    .map((c) => c.key);

  const totals = new Map<
    string,
    { baseline: number; forecast: number; actuals: number }
  >();

  for (const key of monthlyKeys) {
    totals.set(key, { baseline: 0, forecast: 0, actuals: 0 });
  }

  for (const row of grid.rows) {
    for (const cell of row.cells) {
      if (cell.cell_type !== 'monthly') continue;
      const slot = totals.get(cell.key);
      if (!slot) continue;
      slot.baseline += cell.baseline_amount_eur ?? 0;
      slot.forecast += cell.amount_eur ?? 0;
      slot.actuals += cell.actuals_amount_eur ?? 0;
    }
  }

  // Build the ordered chart-row list with cumulative running totals.
  const sortedKeys = [...monthlyKeys].sort();
  let baseCum = 0;
  let fcCum = 0;
  let actCum = 0;
  const rows: ChartRow[] = sortedKeys.map((month) => {
    const slot = totals.get(month) ?? { baseline: 0, forecast: 0, actuals: 0 };
    baseCum += slot.baseline;
    fcCum += slot.forecast;
    actCum += slot.actuals;
    const isPast = isElapsedMonth(month);
    return {
      month,
      baseline: slot.baseline,
      forecast: slot.forecast,
      actuals: slot.actuals,
      baseline_cum: baseCum,
      forecast_cum: fcCum,
      actuals_cum: actCum,
      overrun: isPast && slot.actuals > slot.forecast && slot.actuals > 0,
    };
  });
  return rows;
}

/**
 * Project milestones into contiguous phase segments aligned to the chart's
 * month axis. Each milestone's forecast_start..forecast_end maps to one
 * segment. Baseline date ranges + slip are surfaced via the segment tooltip.
 */
function buildPhaseSegments(
  milestones: MilestoneResponse[],
  rangeStart: string,
  rangeEnd: string,
): PhaseSegment[] {
  if (milestones.length === 0) return [];
  const startOrdinal = monthIndex(rangeStart);
  const endOrdinal = monthIndex(rangeEnd);

  return [...milestones]
    .sort((a, b) => a.sequence_number - b.sequence_number)
    .map((m) => {
      const fcStart = m.forecast_start.slice(0, 7);
      const fcEnd = m.forecast_end.slice(0, 7);
      const startIdx = clampToRangeIndex(monthIndex(fcStart), startOrdinal, endOrdinal);
      const endIdx = clampToRangeIndex(monthIndex(fcEnd), startOrdinal, endOrdinal);
      // Skip milestones outside the visible range entirely.
      if (
        monthIndex(fcEnd) < startOrdinal ||
        monthIndex(fcStart) > endOrdinal
      ) {
        return null;
      }
      const startYear = Math.floor(startIdx / 12);
      const startMonth = (startIdx % 12) + 1;
      const endYear = Math.floor(endIdx / 12);
      const endMonth = (endIdx % 12) + 1;
      const segment: PhaseSegment = {
        start: isoMonth(startYear, startMonth),
        end: isoMonth(endYear, endMonth),
        name: m.name,
        color: m.color ?? '#94a3b8',
        baselineStart: m.baseline_start.slice(0, 7),
        baselineEnd: m.baseline_end.slice(0, 7),
        slipMonths: m.slip_months,
      };
      return segment;
    })
    .filter((seg): seg is PhaseSegment => seg !== null);
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
    payload?: ChartRow;
  }>;
  label?: string;
}

function ChartTooltipContent({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey ?? entry.name}
          className="flex items-center gap-2 font-tabular"
        >
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: entry.color ?? 'currentColor' }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="text-foreground">
            {formatCurrencyCompact(entry.value ?? 0)}
          </span>
        </div>
      ))}
      {row?.overrun && (
        <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">
          Actuals exceed forecast for this month.
        </div>
      )}
    </div>
  );
}

interface OverrunDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

function OverrunDot({ cx, cy, payload }: OverrunDotProps) {
  if (cx === undefined || cy === undefined || !payload?.overrun) {
    return <g />;
  }
  return (
    <g>
      <circle
        cx={cx}
        cy={cy - 8}
        r={3.5}
        fill={COLOR_OVERRUN}
        stroke="var(--card)"
        strokeWidth={1}
      />
    </g>
  );
}

export function ForecastComparisonChart({
  projectId,
  scrollContainerRef,
}: Props) {
  const [grid, setGrid] = useState<MixedGridResponse | null>(null);
  const [milestones, setMilestones] = useState<MilestoneResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'monthly' | 'cumulative'>('monthly');
  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const isMirroringRef = useRef(false);
  const initialScrollAppliedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    initialScrollAppliedRef.current = false;
    Promise.all([
      workbenchApi.getForecastGrid(projectId, {
        granularity: 'monthly',
        lookback_months: 12,
      }),
      milestonesApi.list(projectId).catch(() => ({ items: [], total: 0 })),
    ])
      .then(([gridRes, msRes]) => {
        if (cancelled) return;
        setGrid(gridRes);
        setMilestones(msRes.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load chart');
        setGrid(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Derived chart data
  // -------------------------------------------------------------------------
  const chartRows = useMemo(() => (grid ? aggregateGrid(grid) : []), [grid]);

  const monthKeys = useMemo(() => chartRows.map((r) => r.month), [chartRows]);

  const yearSeparators = useMemo(() => {
    // January boundaries (skip the first month even if it is January so we
    // do not draw a line on the chart edge).
    if (chartRows.length === 0) return [] as string[];
    return chartRows
      .slice(1)
      .filter((r) => r.month.endsWith('-01'))
      .map((r) => r.month);
  }, [chartRows]);

  const phaseSegments = useMemo(() => {
    if (chartRows.length === 0) return [] as PhaseSegment[];
    return buildPhaseSegments(
      milestones,
      chartRows[0].month,
      chartRows[chartRows.length - 1].month,
    );
  }, [milestones, chartRows]);

  const summaryTotals = useMemo(() => {
    if (chartRows.length === 0) {
      return {
        baseline: 0,
        forecast: 0,
        ytdActuals: 0,
        planDriftPct: 0,
        execVariance: 0,
      };
    }
    const baselineTotal = chartRows.reduce((s, r) => s + r.baseline, 0);
    const forecastTotal = chartRows.reduce((s, r) => s + r.forecast, 0);
    const ytdActuals = chartRows
      .filter((r) => isElapsedMonth(r.month) || r.month === DEMO_DATE)
      .reduce((s, r) => s + r.actuals, 0);
    const planDrift = baselineTotal !== 0
      ? ((forecastTotal - baselineTotal) / baselineTotal) * 100
      : 0;
    // Execution variance = actuals to date − forecast for those same months.
    const forecastToDate = chartRows
      .filter((r) => isElapsedMonth(r.month) || r.month === DEMO_DATE)
      .reduce((s, r) => s + r.forecast, 0);
    const execVariance = ytdActuals - forecastToDate;
    return {
      baseline: baselineTotal,
      forecast: forecastTotal,
      ytdActuals,
      planDriftPct: planDrift,
      execVariance,
    };
  }, [chartRows]);

  // The fixed inner content width: bar/line area only (excluding axis +
  // padding). Mirror this onto the scroll wrapper width so scrollLeft is
  // meaningful in pixels-per-month.
  const innerWidth = chartRows.length * PX_PER_MONTH;
  const totalWidth = innerWidth + Y_AXIS_WIDTH + RIGHT_MARGIN;

  // Default scroll position: place ~3 months before demo_date at the left
  // edge so the user lands on a "today-centred" view (3 months past + 6–9
  // months future fits the typical viewport).
  useEffect(() => {
    if (initialScrollAppliedRef.current) return;
    if (loading || chartRows.length === 0) return;
    const target = chartScrollRef.current;
    if (!target) return;
    const idx = chartRows.findIndex((r) => r.month === DEMO_DATE);
    const startIdx = Math.max(0, idx - DEFAULT_LOOKBACK_VIEW);
    const scrollLeft = startIdx * PX_PER_MONTH;
    // Defer to next frame so the inner content has a width.
    requestAnimationFrame(() => {
      if (!chartScrollRef.current) return;
      isMirroringRef.current = true;
      chartScrollRef.current.scrollLeft = scrollLeft;
      // Mirror to the grid container too so they start aligned.
      if (scrollContainerRef?.current) {
        scrollContainerRef.current.scrollLeft = scrollLeft;
      }
      // Release the flag after the browser settles.
      requestAnimationFrame(() => {
        isMirroringRef.current = false;
      });
      initialScrollAppliedRef.current = true;
    });
  }, [loading, chartRows, scrollContainerRef]);

  // Lockstep scroll seam — bidirectional mirror between the chart's own
  // scroll container and the grid's. Guarded so each mirror does not
  // re-trigger the other.
  useEffect(() => {
    const chartEl = chartScrollRef.current;
    const gridEl = scrollContainerRef?.current ?? null;
    if (!chartEl) return;

    function mirrorToGrid() {
      if (isMirroringRef.current) return;
      if (!gridEl || !chartEl) return;
      isMirroringRef.current = true;
      gridEl.scrollLeft = chartEl.scrollLeft;
      // Reset on next animation frame so we do not deadlock the listener
      // chain across rapid scroll events.
      requestAnimationFrame(() => {
        isMirroringRef.current = false;
      });
    }

    function mirrorToChart() {
      if (isMirroringRef.current) return;
      if (!gridEl || !chartEl) return;
      isMirroringRef.current = true;
      chartEl.scrollLeft = gridEl.scrollLeft;
      requestAnimationFrame(() => {
        isMirroringRef.current = false;
      });
    }

    chartEl.addEventListener('scroll', mirrorToGrid, { passive: true });
    gridEl?.addEventListener('scroll', mirrorToChart, { passive: true });

    return () => {
      chartEl.removeEventListener('scroll', mirrorToGrid);
      gridEl?.removeEventListener('scroll', mirrorToChart);
    };
  }, [scrollContainerRef, loading]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
    );
  }

  if (!grid || chartRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No forecast data available for the chart.
      </p>
    );
  }

  // Render a custom X axis tick — Jan markers are bold and the year shows
  // beneath the month. Recharts' tick prop signature varies across versions;
  // the runtime contract we use is just `{ x, y, payload: { value } }`.
  function renderMonthTick(props: unknown) {
    const p = props as {
      x?: number;
      y?: number;
      payload?: { value?: string };
    };
    const { x, y, payload } = p;
    const month = payload?.value ?? '';
    const idx = parseInt(month.slice(5, 7), 10) - 1;
    const monthLabels = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const isJan = month.endsWith('-01');
    const monthLabel = monthLabels[idx] ?? month.slice(5);
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fontSize={10}
          fill="var(--foreground)"
          fontWeight={isJan ? 600 : 400}
        >
          {monthLabel}
        </text>
        {isJan && (
          <text
            x={0}
            y={0}
            dy={26}
            textAnchor="middle"
            fontSize={10}
            fill="var(--foreground)"
            fontWeight={700}
          >
            {month.slice(0, 4)}
          </text>
        )}
      </g>
    );
  }

  // Reference area shading for elapsed months (everything strictly before
  // demo_date). Covers the full Y axis with a subtle muted tint.
  const elapsedAreaEnd = (() => {
    // Find the last past month present in the chart.
    let last: string | null = null;
    for (const r of chartRows) {
      if (r.month < DEMO_DATE) last = r.month;
      else break;
    }
    return last;
  })();

  const elapsedAreaStart = chartRows[0]?.month ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Comparison chart
          </span>
        </div>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <Button
            variant={view === 'monthly' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none h-7 px-3 text-xs"
            onClick={() => setView('monthly')}
          >
            Monthly
          </Button>
          <Button
            variant={view === 'cumulative' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none h-7 px-3 text-xs"
            onClick={() => setView('cumulative')}
          >
            Cumulative
          </Button>
        </div>
      </div>

      <div
        ref={chartScrollRef}
        className="border border-border rounded-lg overflow-x-auto bg-card"
      >
        <div
          style={{ width: totalWidth, minWidth: '100%' }}
          className="relative"
        >
          {view === 'monthly' ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart
                data={chartRows}
                margin={{
                  top: TOP_MARGIN,
                  right: RIGHT_MARGIN,
                  bottom: BOTTOM_MARGIN,
                  left: 0,
                }}
                barGap={2}
                barCategoryGap={'15%'}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--chart-grid)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={renderMonthTick}
                  height={36}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  width={Y_AXIS_WIDTH}
                  tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
                <Legend
                  verticalAlign="top"
                  height={20}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {/* Elapsed-month tint */}
                {elapsedAreaStart && elapsedAreaEnd && elapsedAreaEnd >= elapsedAreaStart && (
                  <ReferenceArea
                    x1={elapsedAreaStart}
                    x2={elapsedAreaEnd}
                    y1={0}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.06}
                    ifOverflow="extendDomain"
                  />
                )}
                {/* Year separators */}
                {yearSeparators.map((m) => (
                  <ReferenceLine
                    key={`yr-${m}`}
                    x={m}
                    stroke="var(--foreground)"
                    strokeOpacity={0.3}
                    strokeWidth={1.5}
                  />
                ))}
                {/* Today line */}
                <ReferenceLine
                  x={DEMO_DATE}
                  stroke={COLOR_OVERRUN}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: 'TODAY',
                    position: 'top',
                    fill: COLOR_OVERRUN,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
                <Bar
                  dataKey="baseline"
                  fill={COLOR_BASELINE}
                  name="Baseline"
                  isAnimationActive={false}
                  maxBarSize={20}
                />
                <Bar
                  dataKey="forecast"
                  fill={COLOR_FORECAST}
                  name="Forecast"
                  isAnimationActive={false}
                  maxBarSize={20}
                />
                <Bar
                  dataKey="actuals"
                  fill={COLOR_ACTUALS}
                  name="Actuals"
                  isAnimationActive={false}
                  maxBarSize={20}
                  shape={(props: unknown) => {
                    const p = props as {
                      x?: number;
                      y?: number;
                      width?: number;
                      height?: number;
                      payload?: ChartRow;
                    };
                    const { x = 0, y = 0, width = 0, height = 0 } = p;
                    return (
                      <g>
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={COLOR_ACTUALS}
                        />
                        {p.payload?.overrun && (
                          <circle
                            cx={x + width / 2}
                            cy={y - 6}
                            r={3.5}
                            fill={COLOR_OVERRUN}
                            stroke="var(--card)"
                            strokeWidth={1}
                          />
                        )}
                      </g>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart
                data={chartRows}
                margin={{
                  top: TOP_MARGIN,
                  right: RIGHT_MARGIN,
                  bottom: BOTTOM_MARGIN,
                  left: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--chart-grid)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={renderMonthTick}
                  height={36}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  width={Y_AXIS_WIDTH}
                  tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                  tickFormatter={(v: number) => formatCurrencyCompact(v)}
                  axisLine={{ stroke: 'var(--chart-grid)' }}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: 'var(--accent)', strokeOpacity: 0.6 }} />
                <Legend
                  verticalAlign="top"
                  height={20}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {elapsedAreaStart && elapsedAreaEnd && elapsedAreaEnd >= elapsedAreaStart && (
                  <ReferenceArea
                    x1={elapsedAreaStart}
                    x2={elapsedAreaEnd}
                    y1={0}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.06}
                    ifOverflow="extendDomain"
                  />
                )}
                {yearSeparators.map((m) => (
                  <ReferenceLine
                    key={`yr-${m}`}
                    x={m}
                    stroke="var(--foreground)"
                    strokeOpacity={0.3}
                    strokeWidth={1.5}
                  />
                ))}
                <ReferenceLine
                  x={DEMO_DATE}
                  stroke={COLOR_OVERRUN}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: 'TODAY',
                    position: 'top',
                    fill: COLOR_OVERRUN,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
                {/* Budget Ceiling — total baseline as a red dashed reference. */}
                {summaryTotals.baseline > 0 && (
                  <ReferenceLine
                    y={summaryTotals.baseline}
                    stroke={COLOR_OVERRUN}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: 'Budget Ceiling',
                      position: 'right',
                      fill: COLOR_OVERRUN,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="baseline_cum"
                  stroke={COLOR_BASELINE}
                  strokeWidth={2}
                  dot={false}
                  name="Baseline (cum)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast_cum"
                  stroke={COLOR_FORECAST}
                  strokeWidth={2}
                  dot={false}
                  name="Forecast (cum)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="actuals_cum"
                  stroke={COLOR_ACTUALS}
                  strokeWidth={2}
                  dot={<OverrunDot />}
                  name="Actuals (cum)"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Phase strip — sits below the chart aligned to the same time axis. */}
          {phaseSegments.length > 0 && (
            <PhaseStrip
              chartRows={chartRows}
              segments={phaseSegments}
              monthKeys={monthKeys}
            />
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap text-xs">
        <SummaryStat label="Baseline" value={formatCurrencyCompact(summaryTotals.baseline)} />
        <SummaryStat label="Forecast" value={formatCurrencyCompact(summaryTotals.forecast)} />
        <SummaryStat label="YTD Actuals" value={formatCurrencyCompact(summaryTotals.ytdActuals)} />
        <SummaryStat
          label="Plan Drift"
          value={formatPercent(summaryTotals.planDriftPct, { signed: true, decimals: 1 })}
          tone={
            summaryTotals.planDriftPct > 5
              ? 'warn'
              : summaryTotals.planDriftPct < -5
                ? 'good'
                : 'neutral'
          }
        />
        <SummaryStat
          label="Execution Variance"
          value={formatCurrencyCompact(summaryTotals.execVariance)}
          tone={
            summaryTotals.execVariance > 0
              ? 'warn'
              : summaryTotals.execVariance < 0
                ? 'good'
                : 'neutral'
          }
        />
      </div>
    </div>
  );
}

interface PhaseStripProps {
  chartRows: ChartRow[];
  segments: PhaseSegment[];
  monthKeys: string[];
}

function PhaseStrip({ chartRows, segments, monthKeys }: PhaseStripProps) {
  // Inner-content geometry: the X axis spans Y_AXIS_WIDTH..(Y_AXIS_WIDTH + N*PX_PER_MONTH).
  // Each month bar slot is PX_PER_MONTH wide and centered at +PX/2.
  // For phase segments we cover the full month slot (segment start month start
  // → segment end month end).
  const totalCount = chartRows.length;
  if (totalCount === 0) return null;

  function leftPxForMonth(month: string): number {
    const idx = monthKeys.indexOf(month);
    if (idx < 0) return Y_AXIS_WIDTH;
    return Y_AXIS_WIDTH + idx * PX_PER_MONTH;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="relative w-full mt-0 mb-1"
        style={{ height: PHASE_STRIP_HEIGHT }}
      >
        {segments.map((seg) => {
          const startPx = leftPxForMonth(seg.start);
          const endPx = leftPxForMonth(seg.end) + PX_PER_MONTH;
          const widthPx = Math.max(endPx - startPx, 8);
          return (
            <ShadTooltip key={`${seg.start}-${seg.name}`}>
              <TooltipTrigger asChild>
                <div
                  className="absolute top-0 h-full rounded-sm border border-border/60"
                  style={{
                    left: startPx,
                    width: widthPx,
                    background: seg.color,
                    opacity: 0.55,
                  }}
                >
                  <span className="block truncate px-1.5 text-[10px] leading-[18px] text-foreground/90 mix-blend-luminosity">
                    {seg.name}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-semibold">{seg.name}</div>
                <div className="text-muted-foreground">
                  Baseline: {seg.baselineStart} → {seg.baselineEnd}
                </div>
                <div className="text-muted-foreground">
                  Forecast: {seg.start} → {seg.end}
                </div>
                {seg.slipMonths !== 0 && (
                  <div className={seg.slipMonths > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    Slip: {seg.slipMonths > 0 ? '+' : ''}{seg.slipMonths} mo
                  </div>
                )}
              </TooltipContent>
            </ShadTooltip>
          );
        })}
        {/* Baseline phase boundary triangles + slip indicators. */}
        {segments.map((seg) => {
          const baselineEndIdx = monthKeys.indexOf(seg.baselineEnd);
          if (baselineEndIdx < 0) return null;
          const baselineEndPx = Y_AXIS_WIDTH + baselineEndIdx * PX_PER_MONTH + PX_PER_MONTH;
          const forecastEndIdx = monthKeys.indexOf(seg.end);
          const forecastEndPx = forecastEndIdx >= 0
            ? Y_AXIS_WIDTH + forecastEndIdx * PX_PER_MONTH + PX_PER_MONTH
            : baselineEndPx;
          const slip = seg.slipMonths;
          return (
            <span key={`baseline-${seg.name}`} className="contents">
              <span
                className="absolute"
                style={{
                  left: baselineEndPx - 4,
                  top: -6,
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '6px solid var(--muted-foreground)',
                  opacity: 0.7,
                }}
                title={`Baseline phase boundary: ${seg.baselineEnd}`}
              />
              {slip > 0 && (
                <span
                  className="absolute"
                  style={{
                    left: Math.min(baselineEndPx, forecastEndPx),
                    top: -2,
                    width: Math.abs(forecastEndPx - baselineEndPx),
                    height: 2,
                    background: COLOR_OVERRUN,
                    opacity: 0.7,
                  }}
                  title={`Phase slip: ${slip} mo`}
                />
              )}
            </span>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

interface SummaryStatProps {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}

function SummaryStat({ label, value, tone = 'neutral' }: SummaryStatProps) {
  const valueClass =
    tone === 'good'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'warn'
        ? 'text-red-700 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <span className={`font-tabular font-semibold ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
