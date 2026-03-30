import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface ChartRow {
  name: string;
  baseline: number;
  forecast: number;
  actuals: number;
}

interface Props {
  data: ChartRow[];
}

export function ProgrammeRollupChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">No data to display.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="baseline" name="Baseline" fill="#94a3b8" radius={[2, 2, 0, 0]} />
          <Bar dataKey="forecast" name="Forecast" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="actuals" name="Actuals" fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
