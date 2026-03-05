import { TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AdvisorPath } from '@/types/api';

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${abs.toFixed(0)}`;
}

interface PathCardProps {
  path: AdvisorPath;
  onApply: (pathId: string) => void;
  applying: boolean;
}

export function PathCard({ path, onApply, applying }: PathCardProps) {
  const { headline_numbers: hn } = path;
  const isSavings = hn.budget_delta < 0;

  return (
    <Card className="bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        {isSavings ? (
          <TrendingDown className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        ) : (
          <TrendingUp className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
        )}
        <h4 className="text-sm font-semibold text-slate-900">{path.name}</h4>
      </div>

      {/* Approach */}
      <p className="text-xs text-slate-600 leading-relaxed">
        {path.approach_description}
      </p>

      {/* Trade-offs */}
      <div className="bg-amber-50 border border-amber-100 rounded px-3 py-2">
        <p className="text-xs text-amber-800 italic">{path.trade_offs}</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Budget Impact
          </p>
          <p
            className={`text-sm font-semibold ${isSavings ? 'text-green-600' : 'text-red-600'}`}
          >
            {formatCurrency(hn.budget_delta)}
          </p>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Projects
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {hn.projects_affected} affected
          </p>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Capacity
          </p>
          <p className="text-xs text-slate-700">{hn.capacity_impact}</p>
        </div>
        <div className="bg-slate-50 rounded px-2 py-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            RAG Changes
          </p>
          <p className="text-xs text-slate-700">{hn.rag_changes}</p>
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
