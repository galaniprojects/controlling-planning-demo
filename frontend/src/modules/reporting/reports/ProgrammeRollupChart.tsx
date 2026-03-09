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
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
        <p className="text-sm text-slate-400">No data to display.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={80}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ fontSize: 12 }}
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
