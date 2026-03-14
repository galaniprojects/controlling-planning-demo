import { ArrowLeft, GitCompare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ScenarioListItem } from '@/types/api';
import { formatCurrencyDelta } from '@/lib/formatters';

function formatHeadlineImpact(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const delta = parsed.total_budget_delta;
    const count = parsed.action_count;
    if (typeof delta === 'number') {
      return `${formatCurrencyDelta(delta)} (${count} action${count !== 1 ? 's' : ''})`;
    }
  } catch {
    // Not JSON
  }
  return raw;
}

interface ScenarioSelectorProps {
  scenarios: ScenarioListItem[];
  selectedIds: number[];
  onSelectedChange: (ids: number[]) => void;
  onCompare: () => void;
  onBack: () => void;
  loading?: boolean;
}

export function ScenarioSelector({
  scenarios,
  selectedIds,
  onSelectedChange,
  onCompare,
  onBack,
  loading,
}: ScenarioSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Scenarios
        </Button>
        <Button
          size="sm"
          disabled={selectedIds.length === 0 || loading}
          onClick={onCompare}
        >
          <GitCompare className="h-4 w-4 mr-1.5" />
          Compare ({selectedIds.length}/3)
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          Compare Scenarios
        </h2>
        <p className="text-sm text-slate-500">
          Select up to 3 scenarios to compare side-by-side with the current
          state.
        </p>
      </div>

      {/* Scenario list */}
      <div className="space-y-1">
        {scenarios.map((s) => {
          const checked = selectedIds.includes(s.id);
          const disabled = !checked && selectedIds.length >= 3;
          return (
            <label
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer transition-colors ${
                checked
                  ? 'bg-blue-50'
                  : disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-slate-50'
              }`}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(v) => {
                  if (v) onSelectedChange([...selectedIds, s.id]);
                  else
                    onSelectedChange(selectedIds.filter((id) => id !== s.id));
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {s.author_name}
                  {s.description ? ` — ${s.description}` : ''}
                </p>
              </div>
              <Badge
                className={`text-[10px] ${
                  s.status === 'published'
                    ? 'bg-green-100 text-green-700 hover:bg-green-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {s.status}
              </Badge>
              {s.headline_impact && (
                <span className="text-xs text-slate-400 max-w-[160px] truncate">
                  {formatHeadlineImpact(s.headline_impact)}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
