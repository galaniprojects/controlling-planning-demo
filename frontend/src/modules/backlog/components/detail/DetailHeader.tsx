/**
 * DetailHeader — back button + project name + stage + DoI + composite score.
 * [A-BK-20] [A-PS-01..13] [A-DOI-01..11] [E-11]
 *
 * A8 update: replaces the inline STAGE_BADGE map with the shared
 * `PipelineStageBadge` + `DoIBadge` components and surfaces the controller
 * `PipelineTransitionMenu` (Pause / Cancel / Re-open) inline.
 */

import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/shared/Skeleton';
import { PipelineStageBadge } from '@/components/shared/PipelineStageBadge';
import { DoIBadge } from '@/components/shared/DoIBadge';
import { PipelineTransitionMenu } from '@/components/shared/PipelineTransitionMenu';
import { usePipelineState } from '@/hooks/usePipelineState';
import { formatDecimal } from '@/lib/formatters';
import type { RankedProjectItem } from '@/types/api';

interface Props {
  item: RankedProjectItem | null;
  loading: boolean;
  projectId: string;
}

function fmtScore(n: number | null): string {
  if (n === null) return '—';
  return formatDecimal(n, 2) + ' / 5';
}

function fmtBudget(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) {
    return '€' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  }
  return '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function DetailHeader({ item, loading, projectId }: Props) {
  const navigate = useNavigate();
  const { data: pipelineState, refresh } = usePipelineState(projectId);

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-start gap-3">
              <h1 className="text-2xl font-semibold text-foreground">
                {item.project_name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <PipelineStageBadge
                  stage={pipelineState?.pipeline_stage ?? item.pipeline_stage}
                />
                <DoIBadge
                  doi={pipelineState?.doi ?? item.doi}
                  frozenDoi={pipelineState?.frozen_doi}
                />
              </div>
            </div>
            <PipelineTransitionMenu
              projectId={projectId}
              state={pipelineState}
              onChanged={() => refresh()}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {item.rank !== null ? (
              <span>Rank #{item.rank}</span>
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
