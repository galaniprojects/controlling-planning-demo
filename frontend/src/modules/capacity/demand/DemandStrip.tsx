/**
 * DemandStrip -- v5.2 W3 Track B (sec.8).
 *
 * Sticky-bottom row beneath the timeline that shows, per visible
 * time column, the count of unfulfilled resource requests directed
 * at CCs within the current scope.
 *
 * Behaviour:
 *   - Per cell: `+N` text, colour bucket 0 / 1-2 / 3+ (sec.8.2).
 *   - Collapsed period: peak count from any month inside (sec.8.3).
 *   - Click: emits `onCellClick(period)` (Track C wires the side
 *     panel; for now this is a no-op placeholder when no handler is
 *     supplied).
 *   - Hidden when group-by is "project" (sec.8.5 / sec.10.7) -- the
 *     project view shows `UnassignedSummary` in its place (Session 9).
 *
 * Data source:
 *   - Defaults to `getDashboardForecast(scopeToApiParam(scope, ccId))`.
 *     The forecast response gives `demand_hours` per month -- the
 *     spec asks for a request count, but we don't have a per-month
 *     RR-count endpoint, so we approximate via
 *     `round(demand_hours / RR_HOURS_PER_MONTH)` which is "good
 *     enough" for the demo. Track A's TimelineView can override the
 *     count source via the optional `monthlyCounts` prop once it has
 *     resolved per-month RR rows.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md sec.8.
 */
import { useEffect, useMemo, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import { cn } from '@/lib/utils';

// --- Public types -------------------------------------------------------

/**
 * One visible time column on the strip. Track A's TimelineView passes
 * the same array it uses to render the time-axis header so the strip
 * stays aligned with the columns above it.
 *
 * `kind`:
 *   - `month`   -> single month, `monthKey` is `YYYY-MM`.
 *   - `quarter` -> collapsed quarter, `monthKeys` lists the months
 *                  (typically 3) the cell spans.
 *   - `year`    -> collapsed year, `monthKeys` lists the months
 *                  (typically 12) the cell spans.
 */
export type DemandPeriod =
  | { kind: 'month'; key: string; label: string; monthKeys: [string] }
  | { kind: 'quarter'; key: string; label: string; monthKeys: string[] }
  | { kind: 'year'; key: string; label: string; monthKeys: string[] };

export interface DemandStripProps {
  /**
   * Visible time columns. Defaults to one cell per month returned by
   * `getDashboardForecast` (i.e. fully-expanded view); Track A passes
   * the actual column list once the time axis collapses are wired.
   */
  periods?: readonly DemandPeriod[];
  /**
   * Per-month unfulfilled request count. Keyed by `YYYY-MM`. When
   * omitted the strip derives counts from the dashboard forecast's
   * `demand_hours` series.
   */
  monthlyCounts?: Readonly<Record<string, number>>;
  /**
   * Cell-click callback. Receives the clicked period descriptor.
   * Track C wires this to the side panel with an unfulfilled-RR list;
   * before then the parent can pass a no-op or `console.log`.
   */
  onCellClick?: (period: DemandPeriod) => void;
  className?: string;
}

// --- Constants ----------------------------------------------------------

/**
 * Approximate hours-per-month for a typical resource request -- used
 * to convert `demand_hours` into a request-count proxy. A real per-
 * month-RR count source would replace this once available; the demo
 * dataset is consistent enough that 80h ~ 1 RR yields the right
 * threshold buckets.
 */
const RR_HOURS_PER_MONTH = 80;

const COLUMN_WIDTH_MONTH = 42; // sec.4.6
const COLUMN_WIDTH_COLLAPSED = 48; // sec.4.6 (quarter / year)
const NAME_COLUMN_WIDTH = 160; // sec.3.3 / sec.4.6

// --- Helpers ------------------------------------------------------------

function bucketClasses(count: number): string {
  if (count <= 0) {
    return 'bg-transparent text-transparent';
  }
  if (count <= 2) {
    // Warning bucket -- amber bg + amber text. Dark variant per CLAUDE.md.
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  // Danger bucket (3+).
  return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
}

function widthForKind(kind: DemandPeriod['kind']): number {
  return kind === 'month' ? COLUMN_WIDTH_MONTH : COLUMN_WIDTH_COLLAPSED;
}

/** Peak (max) count across the months covered by a period (sec.8.3). */
function peakForPeriod(
  period: DemandPeriod,
  monthlyCounts: Readonly<Record<string, number>>,
): number {
  let peak = 0;
  for (const m of period.monthKeys) {
    const value = monthlyCounts[m] ?? 0;
    if (value > peak) peak = value;
  }
  return peak;
}

/** Build a fallback period list (one month each) from forecast points. */
function buildDefaultPeriods(months: readonly string[]): DemandPeriod[] {
  return months.map((m) => {
    const date = new Date(`${m.length === 7 ? `${m}-01` : m}T00:00:00Z`);
    const label = Number.isNaN(date.getTime())
      ? m
      : date.toLocaleDateString('en-GB', {
          month: 'short',
          timeZone: 'UTC',
        });
    return {
      kind: 'month' as const,
      key: m,
      label,
      monthKeys: [m] as [string],
    };
  });
}

// --- Component ----------------------------------------------------------

export function DemandStrip({
  periods,
  monthlyCounts,
  onCellClick,
  className,
}: DemandStripProps) {
  const { scope, ccId, groupBy } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);

  const [fetched, setFetched] = useState<{
    monthly: Record<string, number>;
    months: string[];
  }>({ monthly: {}, months: [] });
  const [loading, setLoading] = useState(false);

  // Whether we need to fetch the forecast ourselves -- only when both
  // prop fallbacks are absent.
  const needsFetch = !monthlyCounts || !periods;

  useEffect(() => {
    if (groupBy === 'project') return; // Hidden in project view, skip.
    if (!needsFetch) return;

    let cancelled = false;
    setLoading(true);

    capacityApi
      .getDashboardForecast(apiScope)
      .then((res) => {
        if (cancelled) return;
        const monthly: Record<string, number> = {};
        const months: string[] = [];
        for (const point of res.items ?? []) {
          // YYYY-MM-DD -> YYYY-MM keying, since the forecast emits
          // first-of-month timestamps.
          const key = point.month.length >= 7 ? point.month.slice(0, 7) : point.month;
          months.push(key);
          monthly[key] = Math.max(
            0,
            Math.round((point.demand_hours ?? 0) / RR_HOURS_PER_MONTH),
          );
        }
        setFetched({ monthly, months });
      })
      .catch(() => {
        if (cancelled) return;
        setFetched({ monthly: {}, months: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiScope, groupBy, needsFetch]);

  // sec.8.5 / sec.10.7 -- hidden in project view.
  if (groupBy === 'project') {
    return null;
  }

  const effectiveMonthly = monthlyCounts ?? fetched.monthly;
  const effectivePeriods: readonly DemandPeriod[] =
    periods ?? buildDefaultPeriods(fetched.months);

  const handleCellClick = (period: DemandPeriod) => {
    if (onCellClick) {
      onCellClick(period);
    } else if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[DemandStrip] cell clicked (no handler wired):', period);
    }
  };

  return (
    <div
      role="row"
      aria-label="Unfulfilled demand strip"
      className={cn(
        'sticky bottom-0 z-10 flex border-t border-border bg-card/95 backdrop-blur-sm',
        className,
      )}
    >
      {/* Sticky-left name cell -- mirrors the timeline name column
          width so the strip lines up beneath the rows above. */}
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
        style={{ width: NAME_COLUMN_WIDTH, minWidth: NAME_COLUMN_WIDTH }}
      >
        Unfulfilled
      </div>

      {/* Per-period cells. */}
      <div className="flex">
        {loading && effectivePeriods.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Loading demand…
          </div>
        ) : (
          effectivePeriods.map((period) => {
            const count = peakForPeriod(period, effectiveMonthly);
            const width = widthForKind(period.kind);
            const aria = `${period.label}: ${
              count === 0 ? 'no unfulfilled requests' : `${count} unfulfilled`
            }`;
            return (
              <button
                key={period.key}
                type="button"
                onClick={() => handleCellClick(period)}
                aria-label={aria}
                className={cn(
                  'flex h-9 items-center justify-center border-l border-border text-[11px] font-medium tabular-nums transition-colors',
                  'hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  bucketClasses(count),
                )}
                style={{ width, minWidth: width }}
              >
                {count > 0 ? `+${count}` : ''}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default DemandStrip;
