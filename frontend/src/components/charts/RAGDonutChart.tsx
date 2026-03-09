import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const RAG_COLORS: Record<string, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

interface Props {
  data: Record<string, number>;
  activeRag?: string | null;
  onSegmentClick?: (rag: string) => void;
}

function CustomTooltip({ active, payload, total }: { active?: boolean; payload?: { name: string; value: number }[]; total: number }) {
  if (!active || !payload?.[0]) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <div className="rounded-md bg-white px-3 py-2 shadow-md border border-slate-200 text-sm">
      <span className="font-medium">{label}</span>: {value} projects ({pct}%)
    </div>
  );
}

export function RAGDonutChart({ data, activeRag, onSegmentClick }: Props) {
  const entries = Object.entries(data)
    .filter(([key]) => key in RAG_COLORS)
    .map(([name, value]) => ({ name, value }));

  const total = entries.reduce((sum, e) => sum + e.value, 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={entries}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          dataKey="value"
          stroke="none"
          onClick={(_data: unknown, index: number) => {
            if (onSegmentClick) {
              onSegmentClick(entries[index].name);
            }
          }}
          cursor={onSegmentClick ? 'pointer' : undefined}
        >
          {entries.map((entry) => (
            <Cell
              key={entry.name}
              fill={RAG_COLORS[entry.name] || '#94a3b8'}
              opacity={activeRag && activeRag !== entry.name ? 0.3 : 1}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip total={total} />} />
        {/* Center label */}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-800 text-2xl font-semibold"
          fontSize={24}
          fontWeight={600}
        >
          {total}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-500"
          fontSize={12}
        >
          projects
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
