/**
 * RankedRow — one row in the ranked backlog table. [A-BK-15][A-BK-16][A-TN-08]
 *
 * Type ring (border-l-4): Type 1 = slate, Type 2 = amber, Type 3 = red.
 * Action-cell slot is reserved for A8 controller actions.
 */

import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDecimal } from '@/lib/formatters';
import type { RankedProjectItem } from '@/types/api';

interface Props {
  item: RankedProjectItem;
  isMisaligned?: boolean;
  /** A8 will inject action buttons via this slot. */
  actionCell?: React.ReactNode;
}

const TYPE_RING: Record<number, string> = {
  1: 'border-l-slate-400 dark:border-l-slate-500',
  2: 'border-l-amber-400 dark:border-l-amber-500',
  3: 'border-l-red-400 dark:border-l-red-500',
};

const TYPE_BADGE: Record<number, string> = {
  1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  3: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const TLEVEL_BADGE: Record<string, string> = {
  T0: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  T1: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  T2: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return formatDecimal(n, 2);
}

function fmtBudget(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) {
    return '€' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  }
  return (
    '€' +
    Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
    ''
  );
}

export function RankedRow({ item, isMisaligned = false, actionCell }: Props) {
  const navigate = useNavigate();

  const typeRing = item.project_type
    ? TYPE_RING[item.project_type] ?? 'border-l-border'
    : 'border-l-border';

  return (
    <tr
      className={cn(
        'border-b border-border transition-colors',
        'hover:bg-accent/40 cursor-pointer',
        isMisaligned && 'bg-amber-50/60 dark:bg-amber-900/10',
        'border-l-4',
        typeRing,
      )}
      onClick={() => navigate(`/backlog/${item.project_id}`)}
    >
      {/* Rank */}
      <td className="px-3 py-2.5 text-sm font-mono text-muted-foreground w-12 tabular-nums">
        {item.rank ?? '—'}
      </td>

      {/* Project name + stage */}
      <td className="px-3 py-2.5">
        <div className="text-sm font-medium text-foreground">
          {item.project_name}
        </div>
        <div className="text-xs text-muted-foreground">
          {item.pipeline_stage ?? '—'}
          {item.doi !== null ? ` · DoI ${item.doi}` : ''}
        </div>
      </td>

      {/* Type badge */}
      <td className="px-3 py-2.5 text-center">
        {item.project_type ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              TYPE_BADGE[item.project_type],
            )}
          >
            T{item.project_type}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* T-level */}
      <td className="px-3 py-2.5 text-center">
        {item.transformation_level ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              TLEVEL_BADGE[item.transformation_level] ??
                'bg-muted text-muted-foreground',
            )}
          >
            {item.transformation_level}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* T-shirt size */}
      <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
        {item.tshirt_size ?? '—'}
      </td>

      {/* Composite score */}
      <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums">
        <span
          className={
            item.composite_score !== null
              ? 'text-foreground'
              : 'text-muted-foreground'
          }
        >
          {fmtScore(item.composite_score)}
        </span>
      </td>

      {/* Budget */}
      <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums text-foreground">
        {fmtBudget(item.total_budget)}
      </td>

      {/* Cutoff status */}
      <td className="px-3 py-2.5 text-center">
        {item.within_cutoff === true ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            In
          </span>
        ) : item.within_cutoff === false ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Out
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* A8 action cell slot */}
      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        {actionCell ?? null}
      </td>
    </tr>
  );
}
