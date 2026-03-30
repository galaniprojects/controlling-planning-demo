import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { PieChartData } from './chartTransform';
import { formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';

interface Props {
  data: PieChartData;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'currency': return formatCurrencyDetailed(value);
    case 'percent': return formatPercent(value);
    case 'hours': return `${formatNumber(value)} h`;
    default: return formatNumber(value);
  }
}

function CustomTooltip({
  active,
  payload,
  total,
  format,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  total: number;
  format: string;
}) {
  if (!active || !payload?.[0]) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-md bg-card px-3 py-2 shadow-md border border-border text-sm text-card-foreground">
      <span className="font-medium">{name}</span>: {formatValue(value, format)} ({pct}%)
    </div>
  );
}

const RADIAN = Math.PI / 180;

function renderLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  name,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  name: string;
  percent: number;
}) {
  if (percent < 0.03) return null; // skip tiny slices
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="var(--foreground)"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

export function ReportPieChart({ data }: Props) {
  const total = data.data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={data.data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={120}
            dataKey="value"
            stroke="none"
            label={renderLabel}
            labelLine={false}
          >
            {data.data.map((_, i) => (
              <Cell key={i} fill={data.colors[i]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip total={total} format={data.measureFormat} />} />
          {/* Center label */}
          <text
            x="50%"
            y="48%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground"
            fontSize={14}
            fontWeight={600}
          >
            {formatValue(total, data.measureFormat)}
          </text>
          <text
            x="50%"
            y="56%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {data.measureLabel}
          </text>
        </PieChart>
      </ResponsiveContainer>

      {data.hasMultipleDimsOrMeasures && (
        <p className="text-xs text-muted-foreground -mt-2">
          Pie chart shows {data.dimensionLabel} by {data.measureLabel} only
        </p>
      )}
    </div>
  );
}
