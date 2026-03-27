import { useState } from 'react';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Table2, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';
import type { AIReportSpec, AIChartSpec, AITableSpec, AIKPIItem } from '@/types/api';

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#818cf8', '#4f46e5', '#7c3aed', '#5b21b6',
  '#3730a3', '#312e81', '#60a5fa', '#2563eb',
];

interface ReportPreviewProps {
  report: AIReportSpec;
}

export function ReportPreview({ report }: ReportPreviewProps) {
  return (
    <div className="space-y-5">
      {/* Title */}
      <h2 className="text-lg font-semibold text-foreground">{report.title}</h2>

      {/* KPIs */}
      {report.kpis.length > 0 && <KPIRow kpis={report.kpis} />}

      {/* Charts */}
      {report.charts.map((chart, i) => (
        <ChartRenderer key={i} spec={chart} />
      ))}

      {/* Table */}
      {report.table && <TableRenderer spec={report.table} />}
    </div>
  );
}

function KPIRow({ kpis }: { kpis: AIKPIItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)` }}>
      {kpis.map((kpi, i) => (
        <Card key={i} className="p-3">
          <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
          <p className="text-lg font-semibold text-foreground">
            {formatKPIValue(kpi)}
          </p>
        </Card>
      ))}
    </div>
  );
}

function formatKPIValue(kpi: AIKPIItem): string {
  if (typeof kpi.value === 'string') return kpi.value;
  switch (kpi.format) {
    case 'currency':
      return formatCurrency(kpi.value);
    case 'percent':
      return formatPercent(kpi.value);
    case 'number':
      return formatNumber(kpi.value);
    default:
      return String(kpi.value);
  }
}

function ChartRenderer({ spec }: { spec: AIChartSpec }) {
  const icon =
    spec.type === 'bar' ? <BarChart3 className="h-3.5 w-3.5" /> :
    spec.type === 'line' ? <LineChartIcon className="h-3.5 w-3.5" /> :
    <PieChartIcon className="h-3.5 w-3.5" />;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{spec.title}</h3>
      </div>
      <div className="h-[300px]">
        {(spec.type === 'bar') && <BarChartView spec={spec} />}
        {(spec.type === 'line') && <LineChartView spec={spec} />}
        {(spec.type === 'pie' || spec.type === 'donut') && <PieChartView spec={spec} />}
      </div>
    </Card>
  );
}

function BarChartView({ spec }: { spec: AIChartSpec }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={spec.data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey={spec.category_key}
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          tickLine={false}
          interval={0}
          angle={spec.data.length > 6 ? -35 : 0}
          textAnchor={spec.data.length > 6 ? 'end' : 'middle'}
          height={spec.data.length > 6 ? 80 : 30}
        />
        <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} />
        <Tooltip formatter={(val: number) => formatCurrencyDetailed(val)} />
        <Bar dataKey={spec.data_key} fill="#6366f1" radius={[4, 4, 0, 0]} />
        {spec.secondary_data_key && (
          <Bar dataKey={spec.secondary_data_key} fill="#a78bfa" radius={[4, 4, 0, 0]} />
        )}
        {spec.secondary_data_key && <Legend />}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartView({ spec }: { spec: AIChartSpec }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={spec.data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey={spec.category_key} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} tickLine={false} />
        <Tooltip formatter={(val: number) => formatCurrencyDetailed(val)} />
        <Line type="monotone" dataKey={spec.data_key} stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
        {spec.secondary_data_key && (
          <Line type="monotone" dataKey={spec.secondary_data_key} stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: '#a78bfa' }} />
        )}
        {spec.secondary_data_key && <Legend />}
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieChartView({ spec }: { spec: AIChartSpec }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={spec.data}
          dataKey={spec.data_key}
          nameKey={spec.category_key}
          cx="50%"
          cy="50%"
          innerRadius={spec.type === 'donut' ? 60 : 0}
          outerRadius={100}
          label={({ name, percent }: { name: string; percent: number }) =>
            `${name}: ${(percent * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {spec.data.map((_, idx) => (
            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(val: number) => formatCurrencyDetailed(val)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TableRenderer({ spec }: { spec: AITableSpec }) {
  const [sortCol, setSortCol] = useState(spec.sort_by ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (spec.sort_dir as 'asc' | 'desc') ?? 'asc',
  );

  const handleSort = (key: string) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  const sortedRows = [...spec.rows].sort((a, b) => {
    if (!sortCol) return 0;
    const av = a[sortCol];
    const bv = b[sortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Table2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        <span className="text-xs font-medium text-muted-foreground">
          {spec.rows.length} row{spec.rows.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {spec.columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/50 last:border-b-0 hover:bg-accent/50"
              >
                {spec.columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-foreground whitespace-nowrap ${
                      col.type !== 'text' ? 'text-right tabular-nums' : ''
                    }`}
                  >
                    {formatCellValue(row[col.key], col.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatCellValue(value: unknown, type: string): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    switch (type) {
      case 'currency':
        return formatCurrencyDetailed(value);
      case 'percent':
        return `${value.toFixed(1).replace('.', ',')}%`;
      case 'number':
        return formatNumber(value);
      default:
        return String(value);
    }
  }
  return String(value);
}
