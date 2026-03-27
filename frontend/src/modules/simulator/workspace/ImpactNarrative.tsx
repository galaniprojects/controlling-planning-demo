import { Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ScenarioImpactDashboard } from '@/types/api';
import { formatCurrency } from '@/lib/formatters';

interface Props {
  impact: ScenarioImpactDashboard;
  affectedCount: number;
}

function generateNarrative(
  impact: ScenarioImpactDashboard,
  affectedCount: number,
): string {
  if (impact.headline) return impact.headline;

  const delta = impact.total_budget_delta;
  const pct =
    impact.total_budget_original !== 0
      ? ((delta / impact.total_budget_original) * 100).toFixed(1).replace('.', ',')
      : '0,0';
  const direction =
    delta < 0 ? 'reduces' : delta > 0 ? 'increases' : 'maintains';

  const rag = impact.rag_distribution;
  return `This scenario ${direction} total portfolio spend by ${formatCurrency(Math.abs(delta))} (${delta <= 0 ? '' : '+'}${pct}%). ${affectedCount} project(s) affected. RAG distribution: ${rag.green ?? 0} Green, ${rag.amber ?? 0} Amber, ${rag.red ?? 0} Red.`;
}

export function ImpactNarrative({ impact, affectedCount }: Props) {
  const narrative = generateNarrative(impact, affectedCount);

  return (
    <Card className="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 p-4">
      <div className="flex gap-3">
        <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
      </div>
    </Card>
  );
}
