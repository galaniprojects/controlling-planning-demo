import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface ChartRow {
  month: string;
  fy_current: number;
  fy_previous: number;
  fy_current_monthly: number;
  fy_previous_monthly: number;
}

interface Props {
  data: ChartRow[];
  cumulative: boolean;
  currentLabel: string;
  previousLabel: string;
}

export function YoYChart({ data, cumulative, currentLabel, previousLabel }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">No data to display.</p>
      </div>
    );
  }

  const currentKey = cumulative ? 'fy_current' : 'fy_current_monthly';
  const previousKey = cumulative ? 'fy_previous' : 'fy_previous_monthly';

  return (
    <div className="rounded-lg border border-border bg-card p-4" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey={currentKey}
            name={`FY ${currentLabel}`}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey={previousKey}
            name={`FY ${previousLabel}`}
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
