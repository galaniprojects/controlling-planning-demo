import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ScenarioImpactDashboard } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  impact: ScenarioImpactDashboard;
  affectedCount: number;
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta === 0)
    return (
      <span className="flex items-center gap-0.5 text-slate-500 text-xs">
        <Minus className="h-3 w-3" /> No change
      </span>
    );

  const isNegative = delta < 0;
  // For budget: negative = savings = good (green)
  const color = isNegative ? 'text-green-600' : 'text-red-600';
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
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-400">Current</span>
          <span className="text-sm font-semibold text-slate-700">
            {currentValue}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-400">Scenario</span>
          <span className="text-sm font-semibold text-slate-900">
            {scenarioValue}
          </span>
        </div>
        {format === 'currency' && <DeltaIndicator delta={delta} />}
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

  return (
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
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
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
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          Projects Affected
        </p>
        <p className="text-2xl font-semibold text-slate-900">{affectedCount}</p>
      </Card>
    </div>
  );
}
