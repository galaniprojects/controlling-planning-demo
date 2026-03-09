import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface PieRow {
  name: string;
  value: number;
}

interface TrendRow {
  month: string;
  spend: number;
}

interface Props {
  pie: PieRow[];
  trend: TrendRow[];
}

export function CCFinancialCharts({ pie, trend }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Budget distribution pie */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-medium text-slate-500 mb-2">Budget by Project</h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pie}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent }: { name: string; percent: number }) =>
                  `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine
              >
                {pie.map((_entry, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly spend trend */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-medium text-slate-500 mb-2">Monthly Spend Trend</h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="spend"
                name="Spend"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
