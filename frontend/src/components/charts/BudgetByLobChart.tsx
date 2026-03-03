import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
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
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="lob_name"
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
          formatter={(value: number) => [formatCurrency(value), 'Budget']}
          contentStyle={{ fontSize: 13, borderRadius: 8 }}
        />
        <Bar dataKey="budget" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
