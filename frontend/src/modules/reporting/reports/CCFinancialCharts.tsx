import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const COST_TYPE_COLORS: Record<string, string> = {
  Internal: '#3b82f6',
  External: '#f59e0b',
};

interface PieRow {
  name: string;
  value: number;
}

const BLUE_PALETTE = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1d4ed8', '#2563eb'];
const AMBER_PALETTE = ['#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fde68a', '#ca8a04', '#eab308'];

interface Props {
  pie: PieRow[];
  costType: PieRow[];
  internalBreakdown: PieRow[];
  externalBreakdown: PieRow[];
}

export function CCFinancialCharts({ pie, costType, internalBreakdown, externalBreakdown }: Props) {
  return (
    <div className="space-y-4">
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

        {/* Spend per cost type */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-medium text-slate-500 mb-2">Spend per Cost Type</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={costType}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatCurrency(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="value"
                  name="Spend"
                  radius={[0, 4, 4, 0]}
                >
                  {costType.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={COST_TYPE_COLORS[entry.name] || '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed breakdown row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Internal spend by role */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-medium text-slate-500 mb-2">Internal Spend by Role</h3>
          <div style={{ height: 280 }}>
            {internalBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 pt-8 text-center">No internal spend data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={internalBreakdown}
                  margin={{ left: 10, right: 20, top: 10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="value" name="Spend" radius={[4, 4, 0, 0]}>
                    {internalBreakdown.map((_entry, i) => (
                      <Cell key={i} fill={BLUE_PALETTE[i % BLUE_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* External spend by cost type */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-medium text-slate-500 mb-2">External Spend by Cost Type</h3>
          <div style={{ height: 280 }}>
            {externalBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 pt-8 text-center">No external spend data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={externalBreakdown}
                  margin={{ left: 10, right: 20, top: 10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => formatCurrency(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="value" name="Spend" radius={[4, 4, 0, 0]}>
                    {externalBreakdown.map((_entry, i) => (
                      <Cell key={i} fill={AMBER_PALETTE[i % AMBER_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
