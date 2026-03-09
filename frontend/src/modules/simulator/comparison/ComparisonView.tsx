import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { scenariosApi } from '@/api/endpoints';
import type {
  ScenarioListItem,
  ComparisonResponse,
  ComparisonColumn,
} from '@/types/api';
import { formatCurrency, formatCurrencyDelta } from '@/lib/formatters';
import { ScenarioSelector } from './ScenarioSelector';
import { ComparisonTable } from './ComparisonTable';

function ColumnSummaryCard({
  column,
  isBaseline,
  baselineTotal,
}: {
  column: ComparisonColumn;
  isBaseline: boolean;
  baselineTotal: number;
}) {
  const total = Object.values(column.data).reduce(
    (sum, d) => sum + d.budget,
    0,
  );
  const delta = total - baselineTotal;
  const ragCounts = { green: 0, amber: 0, red: 0 };
  for (const d of Object.values(column.data)) {
    if (d.rag && d.rag in ragCounts) ragCounts[d.rag as keyof typeof ragCounts]++;
  }

  return (
    <Card className="p-4 space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
        {column.label}
      </p>
      <p className="text-xl font-bold text-slate-900">
        {formatCurrency(total)}
      </p>
      {!isBaseline && delta !== 0 && (
        <p
          className={`text-sm font-medium ${delta < 0 ? 'text-green-600' : 'text-red-600'}`}
        >
          {formatCurrencyDelta(delta)}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {ragCounts.green}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {ragCounts.amber}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {ragCounts.red}
        </span>
      </div>
    </Card>
  );
}

interface ComparisonViewProps {
  onBack: () => void;
}

export function ComparisonView({ onBack }: ComparisonViewProps) {
  const [phase, setPhase] = useState<'select' | 'results'>('select');
  const [allScenarios, setAllScenarios] = useState<ScenarioListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [comparisonData, setComparisonData] =
    useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    setLoading(true);
    scenariosApi
      .list()
      .then((res) => {
        setAllScenarios([...res.my_scenarios, ...res.published_scenarios]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCompare = async () => {
    setComparing(true);
    try {
      const result = await scenariosApi.compare(selectedIds);
      setComparisonData(result);
      setPhase('results');
    } catch {
      // Error handled gracefully
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (phase === 'select') {
    return (
      <ScenarioSelector
        scenarios={allScenarios}
        selectedIds={selectedIds}
        onSelectedChange={setSelectedIds}
        onCompare={handleCompare}
        onBack={onBack}
        loading={comparing}
      />
    );
  }

  // Results phase
  const baselineTotal = comparisonData
    ? Object.values(comparisonData.columns[0]?.data ?? {}).reduce(
        (sum, d) => sum + d.budget,
        0,
      )
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase('select')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Change Selection
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to Scenarios
        </Button>
      </div>

      {/* KPI summary cards */}
      {comparisonData && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${comparisonData.columns.length}, minmax(0, 1fr))`,
          }}
        >
          {comparisonData.columns.map((col, i) => (
            <ColumnSummaryCard
              key={i}
              column={col}
              isBaseline={i === 0}
              baselineTotal={baselineTotal}
            />
          ))}
        </div>
      )}

      {/* Detailed comparison table */}
      {comparisonData && <ComparisonTable columns={comparisonData.columns} />}
    </div>
  );
}
