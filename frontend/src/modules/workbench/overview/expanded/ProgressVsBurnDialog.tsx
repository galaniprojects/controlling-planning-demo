/**
 * Progress vs. Burn expanded dialog per `[E-05a]`.
 *
 * Wraps the ProgressVsBurnChart with milestone zone context, the project's
 * cumulative trajectory data, and the versioned progress snapshots from
 * the E1 progress history endpoint.
 *
 * Triggered by the Progress Tracker tile (`[E-04b]` row 2,3) on the
 * Workbench Overview tab.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ProgressVsBurnChart } from '@/components/charts/ProgressVsBurnChart';
import { milestonesApi, progressApi, workbenchApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import type {
  ProjectOverview,
  TimelineData,
} from '@/types/api';
import type { MilestoneResponse } from '@/types/milestones';
import type {
  ProgressResponse,
  ProgressSnapshotMeta,
  ProgressConfidence,
} from '@/types/progress';

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProgressPoint {
  month: string;
  progress_pct: number;
}

const CONFIDENCE_LABEL: Record<ProgressConfidence, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  blocked: 'Blocked',
};

const CONFIDENCE_BADGE: Record<ProgressConfidence, string> = {
  on_track:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  at_risk:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

/**
 * Convert ISO datetime to a stable YYYY-MM month key. Used to align
 * snapshot timestamps with the chart's monthly X axis.
 */
function isoToMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7);
}

export function ProgressVsBurnDialog({
  projectId,
  open,
  onOpenChange,
}: Props) {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [history, setHistory] = useState<ProgressSnapshotMeta[]>([]);
  const [milestones, setMilestones] = useState<MilestoneResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      workbenchApi.getOverview(projectId),
      workbenchApi.getTimeline(projectId).catch(() => null),
      progressApi.get(projectId).catch(() => null),
      progressApi.getHistory(projectId).catch(() => null),
      milestonesApi.list(projectId).catch(() => null),
    ])
      .then(([ov, tl, prog, hist, ms]) => {
        if (cancelled) return;
        setOverview(ov);
        setTimeline(tl);
        setProgress(prog);
        setHistory(hist?.items ?? []);
        setMilestones(ms?.items ?? []);
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
  }, [open, projectId]);

  // Build sparse progress series from history snapshots + the live read
  // (the live progress is appended at the demo "today" month).
  const progressSeries: ProgressPoint[] = [];
  for (const h of history) {
    const month = isoToMonth(h.snapshot_at);
    if (!month) continue;
    const pct = h.progress_pct;
    if (pct == null) continue;
    progressSeries.push({ month, progress_pct: pct });
  }
  if (progress) {
    const livePct =
      progress.effective_progress_pct ?? progress.progress_pct ?? null;
    if (livePct != null) {
      // Use the latest snapshot month if available, else the demo month.
      const liveMonth =
        isoToMonth(progress.progress_updated_at) ?? '2026-04';
      // Avoid duplicates: only append if the most recent series point is
      // older than the live month.
      if (
        progressSeries.length === 0 ||
        progressSeries[progressSeries.length - 1].month < liveMonth
      ) {
        progressSeries.push({ month: liveMonth, progress_pct: livePct });
      }
    }
  }
  // Ensure ascending order
  progressSeries.sort((a, b) => a.month.localeCompare(b.month));

  const totalForecastEur = overview?.three_point_comparison?.forecast ?? 0;
  const totalBaselineEur = overview?.three_point_comparison?.baseline ?? 0;

  const trajectory = overview?.trajectory_chart ?? [];

  const hasProgress = progressSeries.length > 0;
  const confidence = progress?.next_milestone_confidence ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Progress vs. Burn</DialogTitle>
          <DialogDescription>
            Compares cumulative project progress against budget consumption,
            anchored to the milestone timeline. Gap between lines is the
            value-alignment signal.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading progress data…
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 dark:text-red-400 py-8">
            Failed to load progress data: {error}
          </p>
        )}

        {!loading && !error && overview && (
          <div className="space-y-4">
            {!hasProgress && (
              <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                No progress data has been reported yet for this project. Only
                the burn line is shown — the progress line will start from
                the first reported value (no backfilling, per [E-05d]).
              </div>
            )}

            <div className="rounded-lg border border-border bg-card p-3">
              <ProgressVsBurnChart
                trajectory={trajectory}
                progressSeries={progressSeries}
                milestones={milestones}
                totalForecastEur={totalForecastEur}
                totalBaselineEur={totalBaselineEur}
                todayMonth={timeline?.today_month ?? '2026-04'}
                height={360}
              />
            </div>

            {/* Live status + history sidebar */}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-md border border-border bg-card p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Current state
                </p>
                {progress ? (
                  <>
                    <p className="text-sm text-foreground">
                      <span className="font-semibold tabular-nums">
                        {progress.effective_progress_pct?.toFixed(0) ??
                          progress.progress_pct?.toFixed(0) ??
                          '—'}
                        %
                      </span>{' '}
                      complete
                    </p>
                    {progress.current_milestone && (
                      <p className="text-xs text-muted-foreground">
                        Milestone:{' '}
                        <span className="text-foreground">
                          {progress.current_milestone.name}
                        </span>
                      </p>
                    )}
                    {confidence && (
                      <Badge
                        className={cn(
                          'text-[10px] mt-1 w-fit',
                          CONFIDENCE_BADGE[confidence],
                        )}
                      >
                        {CONFIDENCE_LABEL[confidence]}
                      </Badge>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No progress reported.
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border bg-card p-3 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Latest narrative
                </p>
                <p className="text-xs text-foreground">
                  {progress?.status_narrative || '—'}
                </p>
              </div>

              <div className="rounded-md border border-border bg-card p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Snapshot history
                </p>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No cycle snapshots yet.
                  </p>
                ) : (
                  <ul className="space-y-0.5 text-xs text-foreground max-h-28 overflow-y-auto">
                    {history.slice(0, 6).map((h) => (
                      <li
                        key={h.id}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span
                          className="truncate"
                          title={h.cycle_label ?? undefined}
                        >
                          {h.cycle_label ?? isoToMonth(h.snapshot_at)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {h.progress_pct?.toFixed(0) ?? '—'}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
