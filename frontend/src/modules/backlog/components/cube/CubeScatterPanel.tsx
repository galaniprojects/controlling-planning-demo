/**
 * CubeScatterPanel — one Recharts ScatterChart for a single T-level (T0/T1/T2).
 * X = Value Creation score (0-5), Y = Complexity score (0-5).
 * Bubble radius mapped from t-shirt size. [A-BK-19]
 *
 * Inline styles use CSS custom properties — never hardcoded hex values (CLAUDE.md
 * dark mode rule).
 */

import { useNavigate } from 'react-router-dom';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';
import type { RankedProjectItem } from '@/types/api';
import { CubeTooltipCard } from './CubeTooltipCard';

interface Props {
  title: string;
  items: RankedProjectItem[];
  allItems: RankedProjectItem[];
}

const SIZE_MAP: Record<string, number> = {
  XS: 40,
  S: 80,
  M: 160,
  L: 280,
  XL: 450,
};

const TYPE_FILL: Record<number, string> = {
  1: 'var(--chart-1)',
  2: 'var(--chart-2)',
  3: 'var(--chart-3)',
};

function toScatterData(items: RankedProjectItem[]) {
  return items
    .filter(
      (i) =>
        i.value_creation_score !== null && i.complexity_score !== null,
    )
    .map((i) => ({
      project_id: i.project_id,
      x: i.value_creation_score!,
      y: i.complexity_score!,
      z: SIZE_MAP[i.tshirt_size ?? ''] ?? 100,
      fill: TYPE_FILL[i.project_type ?? 1] ?? 'var(--chart-1)',
    }));
}

export function CubeScatterPanel({ title, items, allItems }: Props) {
  const navigate = useNavigate();
  const data = toScatterData(items);

  const hasData = data.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hasData ? (
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart
            margin={{ top: 8, right: 8, bottom: 20, left: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--chart-grid, hsl(var(--border)))"
            />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 5]}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              label={{
                value: 'Value Creation',
                position: 'insideBottom',
                offset: -12,
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 5]}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              label={{
                value: 'Complexity',
                angle: -90,
                position: 'insideLeft',
                offset: 8,
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 450]} />
            <Tooltip
              content={<CubeTooltipCard items={allItems} />}
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--border)' }}
            />
            <Scatter
              data={data}
              isAnimationActive={false}
              onClick={(payload) => {
                if (payload?.project_id) {
                  navigate(`/backlog/${payload.project_id}`);
                }
              }}
              shape={(props: {
                cx?: number;
                cy?: number;
                r?: number;
                payload?: { fill?: string };
              }) => {
                const { cx = 0, cy = 0, r = 6, payload } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={payload?.fill ?? 'var(--chart-1)'}
                    fillOpacity={0.75}
                    stroke={payload?.fill ?? 'var(--chart-1)'}
                    strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No scored projects in {title}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {data.length} scored / {items.length} total
      </p>
    </div>
  );
}
