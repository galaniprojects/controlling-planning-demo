import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { BudgetByLob } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  data: BudgetByLob[];
}

export function BudgetByLobChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="lob_name"
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCurrency(v)}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name === 'forecast' ? 'Forecast' : 'Baseline']}
          contentStyle={{ fontSize: 13, borderRadius: 8, backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-foreground)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => value === 'forecast' ? 'Forecast' : 'Baseline'}
        />
        <Bar dataKey="forecast" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="baseline" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
