import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface BarRow {
  vendor: string;
  total: number;
}

interface Props {
  bar: BarRow[];
}

export function VendorSpendCharts({ bar }: Props) {
  if (bar.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
        <p className="text-sm text-slate-400">No vendor data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" style={{ height: 360 }}>
      <h3 className="text-xs font-medium text-slate-500 mb-2">Top Vendors by Spend</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={bar} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <YAxis
            dataKey="vendor"
            type="category"
            tick={{ fontSize: 11 }}
            width={100}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="total" name="Total Spend" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
