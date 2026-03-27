import { useState, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { BarChart3, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { PhaseStrip } from './PhaseStrip';
import { TimelineSummaryStrip } from './TimelineSummaryStrip';
import type { TimelineData, TimelineMonthPoint } from '@/types/api';

interface Props {
  data: TimelineData;
}

type ViewMode = 'monthly' | 'cumulative';

const COLORS = {
  baseline: '#cbd5e1',
  forecast: '#3b82f6',
  actuals: '#059669',
  overrun: '#ef4444',
  today: '#ef4444',
  ceiling: '#ef4444',
  elapsed: '#f8fafc',
};

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(m, 10) - 1];
  // Bold January by adding year
  if (m === '01') return `${monthName} ${year}`;
  return monthName;
}

function isJanuary(month: string): boolean {
  return month.endsWith('-01');
}

export function ProjectTimelineChart({ data }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to center on "today" on mount
  useEffect(() => {
    if (scrollRef.current && data.monthly_data.length > 0) {
      const todayIdx = data.monthly_data.findIndex((d) => d.month === data.today_month);
      if (todayIdx >= 0) {
        const barWidth = 60; // approx pixels per bar group
        const containerWidth = scrollRef.current.clientWidth;
        const scrollPos = Math.max(0, todayIdx * barWidth - containerWidth / 3);
        scrollRef.current.scrollLeft = scrollPos;
      }
    }
  }, [data, viewMode]);

  const months = data.monthly_data.map((d) => d.month);
  const chartWidth = Math.max(months.length * 60, 600);

  // Find today index for reference line
  const todayIdx = months.indexOf(data.today_month);

  // Find January boundaries for year separators
  const januaryMonths = months.filter(isJanuary);

  if (viewMode === 'monthly') {
    return (
      <div className="space-y-2 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Project Timeline
          </h3>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex overflow-hidden">
            {/* Fixed Y-axis */}
            <div className="shrink-0 w-16 border-r border-border">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.monthly_data} margin={{ top: 24, right: 0, left: 0, bottom: 24 }}>
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatCurrency(v)}
                    width={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Scrollable chart area */}
            <div ref={scrollRef} className="overflow-x-auto flex-1 min-w-0">
              <div style={{ width: chartWidth }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={data.monthly_data}
                    margin={{ top: 24, right: 16, left: 0, bottom: 0 }}
                    barGap={1}
                    barSize={14}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={({ x, y, payload }) => {
                        const isJan = isJanuary(payload.value);
                        return (
                          <text
                            x={x}
                            y={y + 12}
                            textAnchor="middle"
                            fill={isJan ? 'var(--foreground)' : 'var(--chart-axis)'}
                            fontSize={isJan ? 11 : 10}
                            fontWeight={isJan ? 600 : 400}
                          >
                            {formatMonth(payload.value)}
                          </text>
                        );
                      }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      height={28}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name.charAt(0).toUpperCase() + name.slice(1),
                      ]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-foreground)' }}
                      labelFormatter={(label: string) => formatMonth(label)}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) =>
                        value.charAt(0).toUpperCase() + value.slice(1)
                      }
                    />

                    {/* Elapsed month tinting */}
                    {data.monthly_data
                      .filter((d) => d.is_elapsed)
                      .map((d, i, arr) =>
                        i === 0 ? (
                          <ReferenceArea
                            key="elapsed"
                            x1={arr[0].month}
                            x2={arr[arr.length - 1].month}
                            fill="#f1f5f9"
                            fillOpacity={0.5}
                            ifOverflow="extendDomain"
                          />
                        ) : null,
                      )}

                    {/* Year separator lines */}
                    {januaryMonths.map((m) => (
                      <ReferenceLine
                        key={`jan-${m}`}
                        x={m}
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="none"
                      />
                    ))}

                    {/* Today line */}
                    {todayIdx >= 0 && (
                      <ReferenceLine
                        x={data.today_month}
                        stroke={COLORS.today}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        label={{
                          value: 'TODAY',
                          position: 'top',
                          fill: COLORS.today,
                          fontSize: 9,
                          fontWeight: 700,
                        }}
                      />
                    )}

                    <Bar dataKey="baseline" fill={COLORS.baseline} name="Baseline" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="forecast" fill={COLORS.forecast} name="Forecast" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="actuals" name="Actuals" radius={[2, 2, 0, 0]}>
                      {data.monthly_data.map((entry, index) => (
                        <Cell
                          key={`actuals-${index}`}
                          fill={entry.overrun ? COLORS.overrun : COLORS.actuals}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Phase strip aligned with chart months */}
                {data.phases.length > 0 && (
                  <div style={{ paddingLeft: 0, paddingRight: 16 }}>
                    <PhaseStrip phases={data.phases} months={months} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <TimelineSummaryStrip summary={data.summary} />
      </div>
    );
  }

  // Cumulative view
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Project Timeline — Cumulative
        </h3>
        <ViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>

      <div className="border border-border rounded-lg bg-card p-2">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={data.cumulative_data}
            margin={{ top: 24, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tick={({ x, y, payload }) => {
                const isJan = isJanuary(payload.value);
                return (
                  <text
                    x={x}
                    y={y + 12}
                    textAnchor="middle"
                    fill={isJan ? 'var(--foreground)' : 'var(--chart-axis)'}
                    fontSize={isJan ? 11 : 10}
                    fontWeight={isJan ? 600 : 400}
                  >
                    {formatMonth(payload.value)}
                  </text>
                );
              }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              height={28}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCurrency(v)}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'budget_ceiling'
                  ? 'Budget Ceiling'
                  : name.charAt(0).toUpperCase() + name.slice(1),
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8, backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--card-foreground)' }}
              labelFormatter={(label: string) => formatMonth(label)}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) =>
                value === 'budget_ceiling'
                  ? 'Budget Ceiling'
                  : value.charAt(0).toUpperCase() + value.slice(1)
              }
            />

            {/* Year separators */}
            {januaryMonths.map((m) => (
              <ReferenceLine
                key={`jan-${m}`}
                x={m}
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            ))}

            {/* Today line */}
            {todayIdx >= 0 && (
              <ReferenceLine
                x={data.today_month}
                stroke={COLORS.today}
                strokeWidth={2}
                strokeDasharray="6 3"
                label={{
                  value: 'TODAY',
                  position: 'top',
                  fill: COLORS.today,
                  fontSize: 9,
                  fontWeight: 700,
                }}
              />
            )}

            {/* Budget ceiling */}
            <ReferenceLine
              y={data.budget_ceiling}
              stroke={COLORS.ceiling}
              strokeWidth={1.5}
              strokeDasharray="8 4"
              label={{
                value: `Ceiling: ${formatCurrency(data.budget_ceiling)}`,
                position: 'right',
                fill: COLORS.ceiling,
                fontSize: 10,
              }}
            />

            <Line
              type="monotone"
              dataKey="baseline"
              stroke={COLORS.baseline}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={COLORS.forecast}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="actuals"
              stroke={COLORS.actuals}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <TimelineSummaryStrip summary={data.summary} />
    </div>
  );
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="flex gap-1 border border-border rounded-md p-0.5">
      <Button
        variant={viewMode === 'monthly' ? 'default' : 'ghost'}
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => onChange('monthly')}
      >
        <BarChart3 className="h-3 w-3 mr-1" />
        Monthly
      </Button>
      <Button
        variant={viewMode === 'cumulative' ? 'default' : 'ghost'}
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => onChange('cumulative')}
      >
        <TrendingUp className="h-3 w-3 mr-1" />
        Cumulative
      </Button>
    </div>
  );
}
