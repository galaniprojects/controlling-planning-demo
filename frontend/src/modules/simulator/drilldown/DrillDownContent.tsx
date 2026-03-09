import { useState, useEffect } from 'react';
import { scenariosApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency } from '@/lib/formatters';

function RagDot({ rag }: { rag: string | null }) {
  if (!rag)
    return (
      <span className="h-2.5 w-2.5 rounded-full bg-slate-200 inline-block" />
    );
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full inline-block ${colors[rag] ?? 'bg-slate-200'}`}
    />
  );
}

interface DrillDownContentProps {
  scenarioId: number;
  projectId: string;
}

export function DrillDownContent({
  scenarioId,
  projectId,
}: DrillDownContentProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    scenariosApi
      .drillDown(scenarioId, 'project', projectId)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [scenarioId, projectId]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-400">
          No drill-down detail available for this project.
        </p>
      </div>
    );
  }

  const item = items[0];
  const originalBudget = Number(item.original_budget ?? 0);
  const adjustedBudget = Number(item.adjusted_budget ?? 0);
  const budgetDelta = Number(item.budget_delta ?? 0);
  const originalRag = (item.original_rag as string) ?? null;
  const adjustedRag = (item.adjusted_rag as string) ?? null;
  const isAffected = Boolean(item.is_affected);

  return (
    <div className="p-4 space-y-4">
      {/* Budget comparison */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Original Budget
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCurrency(originalBudget)}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Scenario Budget
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCurrency(adjustedBudget)}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Delta
          </p>
          <p
            className={`text-lg font-semibold ${
              budgetDelta < 0
                ? 'text-green-600'
                : budgetDelta > 0
                  ? 'text-red-600'
                  : 'text-slate-500'
            }`}
          >
            {budgetDelta === 0 ? '—' : formatCurrency(budgetDelta)}
          </p>
        </div>
      </div>

      {/* RAG status */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Original RAG:</span>
          <RagDot rag={originalRag} />
          <span className="text-xs text-slate-600 capitalize">
            {originalRag ?? 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Scenario RAG:</span>
          <RagDot rag={adjustedRag} />
          <span className="text-xs text-slate-600 capitalize">
            {adjustedRag ?? 'N/A'}
          </span>
          {isAffected && originalRag !== adjustedRag && (
            <span className="text-[10px] text-amber-600 font-medium">
              changed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
