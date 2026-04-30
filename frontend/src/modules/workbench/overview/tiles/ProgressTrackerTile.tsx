/**
 * Workbench Overview tile (2,3) — Progress Tracker per `[E-04b]` `[E-04c]`.
 *
 * Shows the current milestone name, an intra-milestone progress bar with
 * percentage, the most recent status narrative excerpt, and the shared
 * `ConfidenceIndicator` diamond per `[E-07g]` (extracted in E8 so all
 * surfaces use the same shape vocabulary).
 *
 * Click target is the Progress vs. Burn dialog (`[E-05a]`).
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import {
  ConfidenceIndicator,
  CONFIDENCE_LABEL,
} from '@/components/shared/ConfidenceIndicator';
import { progressApi } from '@/api/endpoints';
import type { ProgressResponse } from '@/types/progress';

interface Props {
  projectId: string;
  onClick: () => void;
}

export function ProgressTrackerTile({ projectId, onClick }: Props) {
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    progressApi
      .get(projectId)
      .then((p) => {
        if (!cancelled) setProgress(p);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Load failed';
        // 404 is normal for projects predating v5 — show empty state
        if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
          setProgress(null);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const pct = progress?.effective_progress_pct ?? progress?.progress_pct ?? null;
  const confidence = progress?.next_milestone_confidence ?? null;
  const narrative = progress?.status_narrative ?? null;
  const milestoneName = progress?.current_milestone?.name ?? null;
  const hasProgress =
    progress != null && (pct !== null || narrative !== null);

  return (
    <ActionCard
      title="Progress tracker"
      onClick={onClick}
      loading={loading}
      error={error}
      isEmpty={!loading && !error && !hasProgress}
      emptyState="No progress reported yet for this project."
      headerRight={
        confidence ? <ConfidenceIndicator level={confidence} /> : undefined
      }
    >
      {hasProgress && (
        <div className="mt-3 space-y-3">
          {/* Current milestone */}
          {milestoneName && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Current milestone
              </p>
              <p
                className="text-sm font-medium text-foreground truncate"
                title={milestoneName}
              >
                {milestoneName}
              </p>
            </div>
          )}

          {/* Progress bar */}
          {pct !== null && (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Intra-milestone</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              {progress?.checklist?.total_items ? (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  Checklist {progress.checklist.completed_items}/
                  {progress.checklist.total_items}
                  {progress.progress_pct_manual_override
                    ? ' · manual override'
                    : ''}
                </p>
              ) : null}
            </div>
          )}

          {/* Confidence + narrative */}
          {confidence && (
            <div className="flex items-center gap-2 text-xs">
              <ConfidenceIndicator level={confidence} size={12} />
              <span className="text-foreground font-medium">
                {CONFIDENCE_LABEL[confidence]}
              </span>
              {progress?.confidence_reason && (
                <span
                  className="text-muted-foreground truncate"
                  title={progress.confidence_reason}
                >
                  · {progress.confidence_reason}
                </span>
              )}
            </div>
          )}

          {narrative && (
            <p
              className="text-xs text-muted-foreground line-clamp-2 leading-snug"
              title={narrative}
            >
              {narrative}
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
