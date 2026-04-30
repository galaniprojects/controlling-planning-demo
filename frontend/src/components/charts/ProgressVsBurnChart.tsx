/**
 * Progress vs. Burn chart per `[E-05a]` `[E-05b]` `[E-05d]`.
 *
 * Replaces the v4 trajectory chart as the primary project-level chart.
 * Provides a value-alignment signal by comparing project progress against
 * budget consumption, anchored to the milestone timeline.
 *
 * Three lines:
 *  1. Cumulative progress (0-100%) — derived from progress snapshots
 *  2. Cumulative budget consumed (0-100% of total forecast)
 *  3. Baseline planned burn rate (0-100%) — lighter reference line
 *
 * Milestone zones are drawn as ReferenceArea bands (subtle alternating
 * shade) and labelled with the milestone name. Milestone markers use
 * solid / highlighted / dashed Dot shapes per [E-05b]:
 *  - solid       → completed milestone
 *  - highlighted → current milestone
 *  - dashed      → future milestone
 *
 * **Burn-only fallback per [E-05d]:** When `progressSeries` is empty (no
 * progress data captured yet — projects predating v5), only the burn line
 * is drawn. The progress line never starts before the first reported
 * value (no backfilling).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Dot,
} from 'recharts';
import type { TrajectoryPoint } from '@/types/api';
import type { MilestoneResponse } from '@/types/milestones';

interface ProgressPoint {
  /** YYYY-MM */
  month: string;
  /** Cumulative progress 0-100 */
  progress_pct: number;
}

interface ChartRow {
  month: string;
  /** Cumulative budget consumed 0-100 */
  burn_pct: number | null;
  /** Cumulative baseline planned burn 0-100 */
  baseline_pct: number | null;
  /** Cumulative progress 0-100 (sparse) */
  progress_pct: number | null;
}

interface MilestoneZone {
  start: string;
  end: string;
  name: string;
  state: 'past' | 'current' | 'future';
  /** Anchor month for the marker dot — uses forecast_end. */
  marker_month: string;
}

interface MilestoneMarkerProps {
  cx?: number;
  cy?: number;
  payload?: { month: string };
  zones: MilestoneZone[];
}

/**
 * Custom Dot — emits a milestone marker only when the row's month
 * matches a milestone's forecast_end. Solid / highlighted / dashed per
 * the milestone state. Recharts wires the row into `payload`.
 */
function MilestoneMarker(props: MilestoneMarkerProps) {
  const { cx, cy, payload, zones } = props;
  // Recharts needs an SVG element, never null. Render a hidden placeholder
  // when there is no milestone marker for this month.
  if (cx === undefined || cy === undefined || !payload?.month) {
    return <g />;
  }
  const z = zones.find((zone) => zone.marker_month === payload.month);
  if (!z) return <g />;
  if (z.state === 'past') {
    return (
      <Dot
        cx={cx}
        cy={cy}
        r={5}
        fill="var(--chart-1)"
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    );
  }
  if (z.state === 'current') {
    return (
      <g>
        <Dot
          cx={cx}
          cy={cy}
          r={7}
          fill="var(--chart-1)"
          stroke="var(--primary)"
          strokeWidth={2.5}
        />
        <Dot cx={cx} cy={cy} r={3} fill="var(--card)" stroke="none" />
      </g>
    );
  }
  // future — dashed ring
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="none"
      stroke="var(--chart-1)"
      strokeWidth={1.5}
      strokeDasharray="2 2"
    />
  );
}

interface Props {
  /** Monthly cumulative trajectory points (baseline / forecast / actuals). */
  trajectory: TrajectoryPoint[];
  /** Sparse list of progress reports — defaults to []. */
  progressSeries?: ProgressPoint[];
  /** Milestone list — drives zone bands and markers. */
  milestones?: MilestoneResponse[];
  /** Total project forecast in EUR — used to scale burn against 100%. */
  totalForecastEur: number;
  /** Total project baseline in EUR — used to scale baseline against 100%. */
  totalBaselineEur: number;
  /** Chart height in px. */
  height?: number;
  /** Demo "today" month for current-milestone resolution. */
  todayMonth?: string;
}

const DEFAULT_TODAY = '2026-04';

/** Compute milestone zones from the milestone list, classifying by today. */
function buildZones(
  milestones: MilestoneResponse[] | undefined,
  todayMonth: string,
): MilestoneZone[] {
  if (!milestones || milestones.length === 0) return [];
  const sorted = milestones
    .slice()
    .sort((a, b) => a.sequence_number - b.sequence_number);
  return sorted.map((m) => {
    const start = m.forecast_start;
    const end = m.forecast_end;
    let state: 'past' | 'current' | 'future' = 'future';
    if (end < todayMonth) state = 'past';
    else if (start <= todayMonth && end >= todayMonth) state = 'current';
    return {
      start,
      end,
      name: m.name,
      state,
      marker_month: end,
    };
  });
}

export function ProgressVsBurnChart({
  trajectory,
  progressSeries = [],
  milestones,
  totalForecastEur,
  totalBaselineEur,
  height = 320,
  todayMonth = DEFAULT_TODAY,
}: Props) {
  const progressByMonth = new Map<string, number>();
  for (const p of progressSeries) progressByMonth.set(p.month, p.progress_pct);

  const months = trajectory.map((t) => t.month);
  // Compute cumulative actuals & baseline % as we walk forward
  let cumActuals = 0;
  let cumBaseline = 0;
  const rows: ChartRow[] = trajectory.map((point) => {
    cumBaseline += point.baseline ?? 0;
    if (point.actuals != null) cumActuals += point.actuals;
    const burn_pct =
      totalForecastEur > 0
        ? Math.min(100, (cumActuals / totalForecastEur) * 100)
        : null;
    const baseline_pct =
      totalBaselineEur > 0
        ? Math.min(100, (cumBaseline / totalBaselineEur) * 100)
        : null;
    const progress_pct = progressByMonth.has(point.month)
      ? progressByMonth.get(point.month) ?? null
      : null;
    return {
      month: point.month,
      burn_pct: point.actuals != null ? burn_pct : null,
      baseline_pct,
      progress_pct,
    };
  });

  const zones = buildZones(milestones, todayMonth);
  const hasProgress = progressSeries.length > 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />

        {/* Milestone zone bands — alternating subtle shade */}
        {zones.map((z, i) => {
          if (!months.includes(z.start) && !months.includes(z.end)) return null;
          const fill =
            z.state === 'current'
              ? 'var(--primary)'
              : i % 2 === 0
                ? 'var(--muted)'
                : 'var(--accent)';
          const opacity = z.state === 'current' ? 0.08 : 0.12;
          // Clamp to data range
          const x1 = months.includes(z.start) ? z.start : months[0];
          const x2 = months.includes(z.end)
            ? z.end
            : months[months.length - 1];
          return (
            <ReferenceArea
              key={`zone-${i}`}
              x1={x1}
              x2={x2}
              fill={fill}
              fillOpacity={opacity}
              ifOverflow="visible"
              label={{
                value: z.name,
                position: 'insideTop',
                fill: 'var(--muted-foreground)',
                fontSize: 10,
              }}
            />
          );
        })}

        {/* Today reference line */}
        {months.includes(todayMonth) && (
          <ReferenceLine
            x={todayMonth}
            stroke="var(--foreground)"
            strokeDasharray="2 2"
            strokeOpacity={0.6}
            label={{
              value: 'Today',
              position: 'top',
              fill: 'var(--foreground)',
              fontSize: 10,
            }}
          />
        )}

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            `${value?.toFixed(1) ?? 0}%`,
            name,
          ]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--card-foreground)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />

        {/* Baseline burn rate — lighter reference */}
        <Line
          type="monotone"
          dataKey="baseline_pct"
          name="Baseline burn"
          stroke="var(--chart-axis)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />

        {/* Cumulative budget consumed (burn) */}
        <Line
          type="monotone"
          dataKey="burn_pct"
          name="Budget consumed"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />

        {/* Progress line — only when data is available [E-05d] */}
        {hasProgress && (
          <Line
            type="monotone"
            dataKey="progress_pct"
            name="Progress"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dot={(p: any) => (
              <MilestoneMarker
                cx={p.cx}
                cy={p.cy}
                payload={p.payload}
                zones={zones}
              />
            )}
            activeDot={{ r: 5 }}
            connectNulls={true}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
