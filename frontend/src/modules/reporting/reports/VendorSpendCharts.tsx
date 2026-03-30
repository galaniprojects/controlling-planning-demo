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
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">No vendor data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4" style={{ height: 360 }}>
      <h3 className="text-xs font-medium text-muted-foreground mb-2">Top Vendors by Spend</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={bar} layout="vertical" margin={{ left: 100 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <YAxis
            dataKey="vendor"
            type="category"
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            width={100}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)' }}
          />
          <Bar dataKey="total" name="Total Spend" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
