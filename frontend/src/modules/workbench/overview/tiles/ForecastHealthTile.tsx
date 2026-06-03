/**
 * Workbench Overview tile (3,2) — Forecast Health per `[E-04b]`.
 *
 * Shows the current forecast version number + type (cycle / CR / manual),
 * the last submission date, and an on-track / overdue status badge.
 * Click target: forecast version history (Forecast & Planning tab → version
 * history panel).
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { Badge } from '@/components/ui/badge';
import { workbenchApi } from '@/api/endpoints';
import { useConfig } from '@/contexts/ConfigContext';
import { cn } from '@/lib/utils';
import type {
  ForecastVersionMeta,
  ForecastVersionType,
} from '@/types/api';

interface Props {
  projectId: string;
  onClick?: () => void;
}

const VERSION_TYPE_LABEL: Record<ForecastVersionType, string> = {
  cycle: 'Cycle',
  cr_approval: 'CR approval',
  manual: 'Manual',
};

const VERSION_TYPE_COLOR: Record<ForecastVersionType, string> = {
  cycle:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cr_approval:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  manual:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const STALE_DAYS = 60;

/** End-of-month Date for a "YYYY-MM" present period (e.g. "2026-06" → 2026-06-30). */
function endOfMonthDate(currentPeriod: string): Date {
  const year = parseInt(currentPeriod.slice(0, 4), 10);
  const month = parseInt(currentPeriod.slice(5, 7), 10); // 1-based
  // Day 0 of the next month is the last day of `month`.
  return new Date(year, month, 0);
}

function relativeDays(
  iso: string | null,
  now: Date,
): { label: string; staleness: 'fresh' | 'aging' | 'stale' } {
  if (!iso) return { label: '—', staleness: 'stale' };
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { label: '—', staleness: 'stale' };
  const diffMs = now.getTime() - dt.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'in the future', staleness: 'fresh' };
  if (days === 0) return { label: 'today', staleness: 'fresh' };
  if (days === 1) return { label: 'yesterday', staleness: 'fresh' };
  if (days < 30) return { label: `${days}d ago`, staleness: 'fresh' };
  if (days < STALE_DAYS) return { label: `${Math.round(days / 7)}w ago`, staleness: 'aging' };
  return { label: `${Math.round(days / 30)}mo ago`, staleness: 'stale' };
}

export function ForecastHealthTile({ projectId, onClick }: Props) {
  const { currentPeriod } = useConfig();
  const [latest, setLatest] = useState<ForecastVersionMeta | null>(null);
  const [versionCount, setVersionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    workbenchApi
      .listForecastVersions(projectId, { limit: 1 })
      .then((res) => {
        if (cancelled) return;
        setLatest(res.items[0] ?? null);
        setVersionCount(res.total);
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

  const rel = relativeDays(latest?.created_at ?? null, endOfMonthDate(currentPeriod));
  const statusBadgeClass =
    rel.staleness === 'fresh'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : rel.staleness === 'aging'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  const statusLabel =
    rel.staleness === 'fresh'
      ? 'On track'
      : rel.staleness === 'aging'
        ? 'Aging'
        : 'Overdue';

  return (
    <ActionCard
      title="Forecast health"
      onClick={onClick}
      loading={loading}
      error={error}
      isEmpty={!loading && !error && !latest}
      emptyState="No forecast versions captured yet."
    >
      {latest && !loading && !error && (
        <div className="mt-3 space-y-3">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              v{latest.version_number}
            </p>
            <Badge
              variant="outline"
              className={cn('text-[10px]', VERSION_TYPE_COLOR[latest.version_type])}
            >
              {VERSION_TYPE_LABEL[latest.version_type]}
            </Badge>
          </div>

          {latest.cycle_label && (
            <p className="text-xs text-muted-foreground truncate">
              {latest.cycle_label}
            </p>
          )}

          <div className="space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Last submission</span>
              <span className="text-foreground tabular-nums">{rel.label}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Versions</span>
              <span className="text-foreground tabular-nums">{versionCount}</span>
            </div>
          </div>

          <Badge className={cn('text-[10px] w-fit', statusBadgeClass)}>
            {statusLabel}
          </Badge>
        </div>
      )}
    </ActionCard>
  );
}
