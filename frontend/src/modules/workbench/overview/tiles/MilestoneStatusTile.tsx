/**
 * Workbench Overview tile (1,3) — Milestone Status per `[E-04b]`.
 *
 * Shows the current milestone name, a segmented progress bar (one segment
 * per milestone — filled / current / upcoming), and the next milestone
 * date. Clicking opens the milestone detail dialog... Actually for now we
 * navigate to the Forecast & Planning tab where milestones live in v5.
 *
 * Spec defers the milestone detail surface — the click target is "milestone
 * detail view". As an interim we route to the Forecast & Planning tab via
 * the parent's `onClick` handler so the user lands somewhere meaningful.
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { milestonesApi, progressApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import type { MilestoneResponse } from '@/types/milestones';
import type { ProgressResponse } from '@/types/progress';

interface Props {
  projectId: string;
  onClick?: () => void;
}

const DEMO_MONTH = '2026-04';

function compareMonth(a: string | null, b: string | null): number {
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function MilestoneStatusTile({ projectId, onClick }: Props) {
  const [milestones, setMilestones] = useState<MilestoneResponse[] | null>(
    null,
  );
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      milestonesApi.list(projectId),
      progressApi.get(projectId).catch(() => null),
    ])
      .then(([msList, prog]) => {
        if (cancelled) return;
        setMilestones(msList.items);
        setProgress(prog);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const currentId = progress?.current_milestone?.id ?? null;
  const sorted = (milestones ?? []).slice().sort(
    (a, b) => a.sequence_number - b.sequence_number,
  );
  // Index of the current milestone (preferred from progress.current_milestone)
  let currentIdx = -1;
  if (currentId !== null) {
    currentIdx = sorted.findIndex((m) => m.id === currentId);
  }
  // Fallback: pick the milestone that contains DEMO_MONTH
  if (currentIdx === -1) {
    currentIdx = sorted.findIndex(
      (m) =>
        compareMonth(m.forecast_start, DEMO_MONTH) <= 0 &&
        compareMonth(m.forecast_end, DEMO_MONTH) >= 0,
    );
  }
  // Fallback: first milestone whose end is in the future
  if (currentIdx === -1) {
    currentIdx = sorted.findIndex(
      (m) => compareMonth(m.forecast_end, DEMO_MONTH) > 0,
    );
  }

  const current = currentIdx >= 0 ? sorted[currentIdx] : null;
  const next =
    currentIdx >= 0 && currentIdx + 1 < sorted.length
      ? sorted[currentIdx + 1]
      : null;

  return (
    <ActionCard
      title="Milestone status"
      onClick={onClick}
      loading={loading}
      error={error}
      isEmpty={!loading && !error && sorted.length === 0}
      emptyState="No milestones defined."
    >
      {sorted.length > 0 && (
        <div className="mt-3 space-y-3">
          {/* Current milestone */}
          {current ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Current
              </p>
              <p
                className="text-sm font-semibold text-foreground truncate"
                title={current.name}
              >
                {current.name}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {current.forecast_start} → {current.forecast_end}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              All milestones complete.
            </p>
          )}

          {/* Segmented progress bar */}
          <div
            className="flex gap-0.5 h-2"
            role="progressbar"
            aria-valuenow={currentIdx >= 0 ? currentIdx + 1 : 0}
            aria-valuemax={sorted.length}
          >
            {sorted.map((m, idx) => {
              const state =
                idx < currentIdx
                  ? 'past'
                  : idx === currentIdx
                    ? 'current'
                    : 'upcoming';
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex-1 rounded-sm',
                    state === 'past' && 'bg-primary',
                    state === 'current' && 'bg-primary/60',
                    state === 'upcoming' && 'bg-muted',
                  )}
                  title={`${m.sequence_number}. ${m.name}`}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            Step {currentIdx >= 0 ? currentIdx + 1 : sorted.length} of{' '}
            {sorted.length}
          </p>

          {/* Next milestone */}
          {next && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Next
              </p>
              <p
                className="text-xs text-foreground truncate"
                title={next.name}
              >
                {next.name}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Starts {next.forecast_start}
              </p>
            </div>
          )}
        </div>
      )}
    </ActionCard>
  );
}
