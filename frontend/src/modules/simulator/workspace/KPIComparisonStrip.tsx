import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ScenarioImpactDashboard, TimeFrameSegment } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  impact: ScenarioImpactDashboard;
  affectedCount: number;
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta === 0)
    return (
      <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="h-3 w-3" /> No change
      </span>
    );

  const isNegative = delta < 0;
  // For budget: negative = savings = good (green)
  const color = isNegative ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const Icon = isNegative ? ArrowDown : ArrowUp;

  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {formatCurrency(Math.abs(delta))}
    </span>
  );
}

function KPICard({
  label,
  currentValue,
  scenarioValue,
  delta,
  format = 'currency',
}: {
  label: string;
  currentValue: string;
  scenarioValue: string;
  delta: number;
  format?: 'currency' | 'text';
}) {
  return (
    <Card className="p-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Current</span>
          <span className="text-sm font-semibold text-foreground">
            {currentValue}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Scenario</span>
          <span className="text-sm font-semibold text-foreground">
            {scenarioValue}
          </span>
        </div>
        {format === 'currency' && <DeltaIndicator delta={delta} />}
      </div>
    </Card>
  );
}

function TimeFrameCard({ segment }: { segment: TimeFrameSegment }) {
  return (
    <Card className="p-3 space-y-1.5 flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {segment.label}
      </p>
      <div className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">FC</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatCurrency(segment.original)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">Scenario</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatCurrency(segment.adjusted)}
          </span>
        </div>
        <DeltaIndicator delta={segment.delta} />
      </div>
    </Card>
  );
}

export function KPIComparisonStrip({ impact, affectedCount }: Props) {
  const pctChange =
    impact.total_budget_original !== 0
      ? ((impact.total_budget_delta / impact.total_budget_original) * 100).toFixed(1).replace('.', ',')
      : '0,0';

  const rag = impact.rag_distribution;
  const breakdown = impact.time_frame_breakdown;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Total Budget"
          currentValue={formatCurrency(impact.total_budget_original)}
          scenarioValue={formatCurrency(impact.total_budget_adjusted)}
          delta={impact.total_budget_delta}
        />
        <KPICard
          label="Budget Change"
          currentValue="Baseline"
          scenarioValue={`${Number(pctChange.replace(',', '.')) > 0 ? '+' : ''}${pctChange}%`}
          delta={impact.total_budget_delta}
        />
        <Card className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            RAG Distribution
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm font-semibold">{rag.green ?? 0}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold">{rag.amber ?? 0}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-sm font-semibold">{rag.red ?? 0}</span>
            </span>
          </div>
        </Card>
        <Card className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Projects Affected
          </p>
          <p className="text-2xl font-semibold text-foreground">{affectedCount}</p>
        </Card>
      </div>

      {/* SIM-03: Time Frame Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Portfolio Impact by Time Frame</p>
          <div className="flex gap-3">
            {breakdown.map((seg) => (
              <TimeFrameCard key={seg.label} segment={seg} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
