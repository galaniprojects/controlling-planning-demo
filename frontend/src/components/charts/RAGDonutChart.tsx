import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const RAG_COLORS: Record<string, string> = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

interface Props {
  data: Record<string, number>;
}

export function RAGDonutChart({ data }: Props) {
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
        >
          {entries.map((entry) => (
            <Cell key={entry.name} fill={RAG_COLORS[entry.name] || '#94a3b8'} />
          ))}
        </Pie>
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
