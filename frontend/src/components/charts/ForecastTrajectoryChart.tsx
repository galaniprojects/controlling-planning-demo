import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ForecastTrajectoryPoint } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

// INVESTIGATION (v2 6.3): This chart shows monthly forecast totals (SUM per month),
// NOT cumulative spend. Backend computes SUM(Forecast.amount_eur) GROUP BY month
// (portfolio.py:178-186). Only shows forecast line — missing baseline and actuals
// series. "Numbers don't match" reports likely stem from users comparing monthly
// totals here with annual/cumulative figures elsewhere. Fix deferred to v2 Session 2.

interface Props {
  data: ForecastTrajectoryPoint[];
}

export function ForecastTrajectoryChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: '#64748b' }}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCurrency(v)}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Forecast']}
          contentStyle={{ fontSize: 13, borderRadius: 8 }}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#1d4ed8"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
