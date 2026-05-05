/**
 * Variance waterfall (bridge) chart per `[E-05c]`.
 *
 * Shows how the project's forecast moved from the original baseline through
 * a sequence of grouped CR-driven changes to the current forecast. Bars
 * are clickable and emit the underlying CR group id via `onBarClick` so
 * the parent dialog can navigate to CR detail.
 *
 * Implementation:
 *  - Recharts BarChart with TWO stacked bars per row:
 *      `_invisible` (transparent spacer) + `_value` (the visible bar).
 *  - The spacer is sized so that the visible portion of each bar starts
 *    at the running total of preceding rows. End anchor bars (Baseline,
 *    Current Forecast) span the full height to 0.
 *  - Bar fill encodes direction: green for decreases, red for increases,
 *    neutral for the start/end totals.
 *
 * Step categories per `[E-05c]`:
 *  - Baseline (start)
 *  - Scope CRs (Σ of approved CRs in category 'scope')
 *  - Rate / cost changes (category 'rate' / 'cost')
 *  - Resource changes (category 'resource')
 *  - … any additional grouped categories surfaced by the data
 *  - Current forecast (end)
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCurrency, formatCurrencyDelta } from '@/lib/formatters';

export interface WaterfallStep {
  /** Stable identifier — used by `onBarClick`. */
  id: string;
  /** Display label, e.g. "Scope CRs", "Baseline". */
  label: string;
  /** Step type — drives bar colour and whether it's an anchor. */
  type: 'start' | 'change' | 'end';
  /**
   * Net delta in EUR. For `start` and `end` rows this is the absolute
   * total; for `change` rows it's the signed delta. Positive = increase,
   * negative = decrease.
   */
  amount_eur: number;
  /** Optional tooltip / aria description, e.g. "5 approved CRs". */
  description?: string;
}

interface ChartRow {
  step: WaterfallStep;
  /** Transparent spacer so the visible bar starts at the running total. */
  _invisible: number;
  /** Magnitude of the visible bar segment. */
  _value: number;
  /** End-of-row running total (for tooltips). */
  _running_total: number;
}

interface Props {
  /** Ordered steps. The component computes running totals internally. */
  steps: WaterfallStep[];
  /** Click handler — receives the step's id (e.g. category key or CR id). */
  onBarClick?: (stepId: string, step: WaterfallStep) => void;
  height?: number;
}

const NEUTRAL_FILL = 'var(--chart-axis)';
const POSITIVE_FILL = 'rgb(220 38 38)'; // increase = red
const NEGATIVE_FILL = 'rgb(22 163 74)'; // decrease = green

function colorFor(step: WaterfallStep): string {
  if (step.type !== 'change') return NEUTRAL_FILL;
  return step.amount_eur >= 0 ? POSITIVE_FILL : NEGATIVE_FILL;
}

export function VarianceWaterfallChart({
  steps,
  onBarClick,
  height = 320,
}: Props) {
  const rows: ChartRow[] = [];
  let running = 0;
  for (const step of steps) {
    if (step.type === 'start') {
      // Anchor bar: full height from 0 to step.amount_eur
      running = step.amount_eur;
      rows.push({
        step,
        _invisible: 0,
        _value: step.amount_eur,
        _running_total: running,
      });
    } else if (step.type === 'change') {
      // Bridge bar: starts at min(prev, prev+delta), magnitude = |delta|
      const prev = running;
      const next = running + step.amount_eur;
      const base = Math.min(prev, next);
      rows.push({
        step,
        _invisible: base,
        _value: Math.abs(step.amount_eur),
        _running_total: next,
      });
      running = next;
    } else {
      // End anchor: full bar from 0 to step.amount_eur (running total)
      running = step.amount_eur;
      rows.push({
        step,
        _invisible: 0,
        _value: step.amount_eur,
        _running_total: running,
      });
    }
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        margin={{ top: 16, right: 16, left: 0, bottom: 64 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey={(r: ChartRow) => r.step.label}
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={70}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCurrency(v)}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--card-foreground)',
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={({ active, payload }: any) => {
            if (!active || !payload || payload.length === 0) return null;
            const row: ChartRow = payload[0].payload;
            const step = row.step;
            const valueLabel =
              step.type === 'change'
                ? formatCurrencyDelta(step.amount_eur)
                : formatCurrency(step.amount_eur);
            return (
              <div className="rounded-md border border-border bg-card p-2 text-xs shadow-md">
                <p className="font-medium text-foreground">{step.label}</p>
                <p className="tabular-nums text-foreground mt-1">
                  {valueLabel}
                </p>
                <p className="tabular-nums text-muted-foreground">
                  Running total: {formatCurrency(row._running_total)}
                </p>
                {step.description && (
                  <p className="text-muted-foreground mt-1">
                    {step.description}
                  </p>
                )}
                {onBarClick && step.type === 'change' && (
                  <p className="text-muted-foreground mt-1 italic">
                    Click bar for CR detail
                  </p>
                )}
              </div>
            );
          }}
        />

        {/* Transparent spacer */}
        <Bar dataKey="_invisible" stackId="wf" fill="transparent" />

        {/* Visible bar */}
        <Bar
          dataKey="_value"
          stackId="wf"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(d: any) => {
            const row = d?.payload as ChartRow | undefined;
            if (!row || !onBarClick) return;
            onBarClick(row.step.id, row.step);
          }}
          cursor={onBarClick ? 'pointer' : 'default'}
        >
          {rows.map((r) => (
            <Cell key={r.step.id} fill={colorFor(r.step)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
