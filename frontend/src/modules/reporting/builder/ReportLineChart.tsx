import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { LineChartData } from './chartTransform';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';

interface Props {
  data: LineChartData;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'currency': return formatCurrency(value);
    case 'percent': return formatPercent(value);
    case 'hours': return `${formatNumber(value)} h`;
    default: return formatNumber(value);
  }
}

export function ReportLineChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey={data.xKey}
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatValue(v, data.yFormat)}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const series = data.series.find((s) => s.key === name);
            return [formatValue(value, data.yFormat), series?.label ?? name];
          }}
          contentStyle={{
            fontSize: 13,
            borderRadius: 8,
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--card-foreground)',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => {
            const series = data.series.find((s) => s.key === value);
            return series?.label ?? value;
          }}
        />
        {data.series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
