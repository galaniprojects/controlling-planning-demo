import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

const LOB_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface ChartPoint {
  project_name: string;
  forecast: number;
  actual: number;
  lob: string;
  rating: string;
}

interface Props {
  data: ChartPoint[];
}

export function ForecastAccuracyChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-12 text-center">
        <p className="text-sm text-muted-foreground">No data to display.</p>
      </div>
    );
  }

  // Group by LoB for color-coded scatter series
  const lobGroups = data.reduce<Record<string, ChartPoint[]>>((acc, p) => {
    if (!acc[p.lob]) acc[p.lob] = [];
    acc[p.lob].push(p);
    return acc;
  }, {});
  const lobNames = Object.keys(lobGroups);

  // Compute range for the perfect-accuracy diagonal line
  const allValues = data.flatMap((p) => [p.forecast, p.actual]);
  const minVal = Math.min(...allValues) * 0.9;
  const maxVal = Math.max(...allValues) * 1.1;
  const diagonalData = [
    { forecast: minVal, actual: minVal },
    { forecast: maxVal, actual: maxVal },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            dataKey="forecast"
            type="number"
            domain={[minVal, maxVal]}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickFormatter={(v: number) => formatCurrency(v)}
            label={{ value: 'Forecast (€)', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--chart-axis)' }}
          />
          <YAxis
            dataKey="actual"
            type="number"
            domain={[minVal, maxVal]}
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickFormatter={(v: number) => formatCurrency(v)}
            label={{ value: 'Actual (€)', angle: -90, position: 'insideLeft', offset: -5, fontSize: 11, fill: 'var(--chart-axis)' }}
          />
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const p = payload[0]?.payload as ChartPoint | undefined;
              if (!p) return null;
              return (
                <div className="rounded border border-border bg-card p-2 shadow text-xs text-foreground">
                  <p className="font-medium">{p.project_name}</p>
                  <p>Forecast: {formatCurrency(p.forecast)}</p>
                  <p>Actual: {formatCurrency(p.actual)}</p>
                  <p>LoB: {p.lob}</p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* Perfect accuracy diagonal */}
          <Line
            data={diagonalData}
            dataKey="actual"
            stroke="#94a3b8"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            dot={false}
            name="Perfect Accuracy"
            legendType="line"
          />

          {/* One scatter series per LoB */}
          {lobNames.map((lob, i) => (
            <Scatter
              key={lob}
              data={lobGroups[lob]}
              name={lob}
              fill={LOB_COLORS[i % LOB_COLORS.length]}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
