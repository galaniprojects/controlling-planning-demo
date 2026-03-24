import {
  Trash2,
  ArrowDown,
  Clock,
  FastForward,
  Scissors,
  TrendingDown,
  Layers,
  X,
  Pause,
  Users,
  Filter,
  Snowflake,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ScenarioAction } from '@/types/api';

interface Props {
  action: ScenarioAction;
  onRemove: (actionId: number) => void;
  projectNames: Map<string, string>;
  readOnly?: boolean;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  remove_project: Trash2,
  reduce_budget: ArrowDown,
  adjust_budget: ArrowDown,
  increase_budget: ArrowDown,
  delay_project: Clock,
  defer_project: Clock,
  cut_consulting: Scissors,
  adjust_external_cost: Scissors,
  accelerate_project: FastForward,
  across_the_board_cut: TrendingDown,
  apply_pct_cut: TrendingDown,
  reduce_lob: Layers,
  cut_by_lob: Layers,
  pause_project: Pause,
  change_allocation: Users,
  change_resources: Users,
  cut_by_type: Filter,
  freeze_new_starts: Snowflake,
  cap_cost_category: ShieldAlert,
  rate_escalation: TrendingUp,
};

function describeAction(
  action: ScenarioAction,
  projectNames: Map<string, string>,
): string {
  const pName = action.project_id
    ? projectNames.get(action.project_id) || action.project_id
    : '';
  const params = action.parameters;

  switch (action.action_type) {
    case 'remove_project':
      return `Remove: ${pName}`;
    case 'reduce_budget':
    case 'adjust_budget':
      return `Reduce Budget: ${pName} (${params.percentage ?? params.adjustment_pct ?? params.pct ?? '?'}%)`;
    case 'increase_budget':
      return `Increase Budget: ${pName} (+€${Number(params.amount ?? 0).toLocaleString()})`;
    case 'delay_project':
    case 'defer_project':
      return `Delay: ${pName}`;
    case 'cut_consulting':
    case 'adjust_external_cost':
      return `Cut Consulting: ${pName} (${params.percentage ?? params.adjustment_pct ?? '15'}%)`;
    case 'accelerate_project':
      return `Accelerate: ${pName} (${params.months ?? params.months_forward ?? '?'}mo)`;
    case 'across_the_board_cut':
    case 'apply_pct_cut':
      return `${Math.abs(Number(params.adjustment_pct ?? params.percentage ?? params.pct ?? 20))}% Across-the-Board Cut`;
    case 'reduce_lob':
    case 'cut_by_lob':
      return `Cut LoB: ${params.lob_id} (${params.percentage ?? params.pct ?? '?'}%)`;
    case 'pause_project':
      return `Pause: ${pName} from ${params.start_month ?? params.from_month ?? '?'}`;
    case 'change_allocation':
    case 'change_resources':
      return `${params.action === 'remove' ? 'Remove' : params.action === 'add' ? 'Add' : 'Modify'} Resources: ${pName} (${params.hours_per_month ?? params.hours_delta ?? '?'}h/mo)`;
    case 'cut_by_type':
      return `Cut ${params.target_type === 'service' ? 'Services' : params.target_type === 'project' ? 'Projects' : 'All'}: ${params.reduction_pct ?? params.percentage ?? '?'}%`;
    case 'freeze_new_starts':
      return `Freeze New Starts after ${params.cutoff_month ?? '?'}`;
    case 'cap_cost_category':
      return `Cap Cost Category: €${Number(params.cap_amount ?? 0).toLocaleString()} ${params.cap_period ?? 'annual'}`;
    case 'rate_escalation':
      return `Rate +${params.increase_pct ?? '?'}% (${params.scope_type ?? '?'}) from ${params.effective_month ?? '?'}`;
    default:
      return `${action.action_type}${pName ? ': ' + pName : ''}`;
  }
}

function formatDelta(impact: Record<string, unknown>): string | null {
  let delta: number | undefined;

  if (impact.budget_delta !== undefined && impact.budget_delta !== null) {
    delta = Number(impact.budget_delta);
  } else if (impact.total_budget_delta !== undefined && impact.total_budget_delta !== null) {
    delta = Number(impact.total_budget_delta);
  } else if (impact.budget_freed !== undefined && impact.budget_freed !== null) {
    // budget_freed is positive = money saved, display as negative (reduction)
    delta = -Math.abs(Number(impact.budget_freed));
  }

  if (delta === undefined) return null;
  const abs = Math.abs(delta);
  const sign = delta < 0 ? '-' : delta > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${abs}`;
}

export function ActionItem({ action, onRemove, projectNames, readOnly }: Props) {
  const Icon = ACTION_ICONS[action.action_type] ?? Layers;
  const description = describeAction(action, projectNames);
  const delta = formatDelta(action.impact_delta);

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 group">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 truncate">{description}</p>
        {action.group_label && (
          <Badge
            variant="outline"
            className="text-[10px] text-indigo-600 border-indigo-200 mt-0.5"
          >
            {action.group_label}
          </Badge>
        )}
      </div>
      {delta && (
        <span
          className={`text-xs font-medium shrink-0 ${
            delta.startsWith('-') ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {delta}
        </span>
      )}
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRemove(action.id)}
        >
          <X className="h-3.5 w-3.5 text-slate-400" />
        </Button>
      )}
    </div>
  );
}
