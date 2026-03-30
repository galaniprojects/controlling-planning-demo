import { TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AdvisorPath } from '@/types/api';
import { formatCurrencyDelta } from '@/lib/formatters';

interface PathCardProps {
  path: AdvisorPath;
  onApply: (pathId: string) => void;
  applying: boolean;
}

export function PathCard({ path, onApply, applying }: PathCardProps) {
  const { headline_numbers: hn } = path;
  const isSavings = hn.budget_delta < 0;

  return (
    <Card className="bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        {isSavings ? (
          <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        ) : (
          <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
        )}
        <h4 className="text-sm font-semibold text-foreground">{path.name}</h4>
      </div>

      {/* Approach */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {path.approach_description}
      </p>

      {/* Trade-offs */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 rounded px-3 py-2">
        <p className="text-xs text-amber-800 dark:text-amber-400 italic">{path.trade_offs}</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-muted/50 rounded px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Budget Impact
          </p>
          <p
            className={`text-sm font-semibold ${isSavings ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {formatCurrencyDelta(hn.budget_delta)}
          </p>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Projects
          </p>
          <p className="text-sm font-semibold text-foreground">
            {hn.projects_affected} affected
          </p>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Capacity
          </p>
          <p className="text-xs text-foreground">{hn.capacity_impact}</p>
        </div>
        <div className="bg-muted/50 rounded px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            RAG Changes
          </p>
          <p className="text-xs text-foreground">{hn.rag_changes}</p>
        </div>
      </div>

      {/* Apply button */}
      <Button
        size="sm"
        className="w-full bg-indigo-600 hover:bg-indigo-700"
        disabled={applying}
        onClick={() => onApply(path.path_id)}
      >
        Apply to Scenario
      </Button>
    </Card>
  );
}
