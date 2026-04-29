/**
 * DetailHeader — back button + project name + stage + DoI + composite score.
 * [A-BK-20]
 */

import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/shared/Skeleton';
import type { RankedProjectItem } from '@/types/api';
import { cn } from '@/lib/utils';

interface Props {
  item: RankedProjectItem | null;
  loading: boolean;
  projectId: string;
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return n.toFixed(2).replace('.', ',') + ' / 5';
}

function fmtBudget(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) {
    return '€' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  }
  return '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const STAGE_BADGE: Record<string, string> = {
  'Under Evaluation': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Completed: 'bg-muted text-muted-foreground',
};

export function DetailHeader({ item, loading, projectId }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to backlog"
        >
          <ChevronLeft className="size-3" aria-hidden />
          Backlog
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-5 w-64" />
        </div>
      ) : item ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {item.project_name}
            </h1>
            {item.pipeline_stage ? (
              <span
                className={cn(
                  'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                  STAGE_BADGE[item.pipeline_stage] ??
                    'bg-muted text-muted-foreground',
                )}
              >
                {item.pipeline_stage}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {item.rank !== null ? (
              <span>Rank #{item.rank}</span>
            ) : null}
            {item.doi !== null ? (
              <span>DoI {item.doi}</span>
            ) : null}
            {item.composite_score !== null ? (
              <span>
                Composite{' '}
                <span className="font-medium text-foreground">
                  {fmtScore(item.composite_score)}
                </span>
              </span>
            ) : null}
            {item.within_cutoff !== null ? (
              <span
                className={
                  item.within_cutoff
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {item.within_cutoff ? 'Within cutoff' : 'Below cutoff'}
              </span>
            ) : null}
            {item.total_budget !== null ? (
              <span>Budget {fmtBudget(item.total_budget)}</span>
            ) : null}
            {item.tshirt_size ? (
              <span>Size {item.tshirt_size}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">{projectId}</h1>
          <p className="text-sm text-muted-foreground">
            Project not in backlog ranking data.
          </p>
        </div>
      )}
    </div>
  );
}
