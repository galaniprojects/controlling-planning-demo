/**
 * KPISummaryBar — v5.2 W3 Track B (§5).
 *
 * Five `SummaryCard` tiles in a responsive grid, positioned between
 * the ScopeBar and the FilterChipBar. All values recompute when the
 * scope changes (§5.3); clicking a tile activates its corresponding
 * filter chip (§5.4).
 *
 * Data sources (per the Lead 0.2 client seams):
 *   - Headcount       -> `getDashboardHeadcountBreakdown` (.total)
 *   - Avg utilization -> `getDashboardForecast`
 *                        (sum allocated_hours / sum available_hours x 100)
 *   - Over-allocated  -> `getDashboardHotspots`
 *                        (distinct `target_id` where category =
 *                         'over_allocation' AND target_type = 'person')
 *   - Pending requests-> `getInbox`
 *                        (sum of role_badges[].count across items)
 *   - Supply gap      -> `getDashboardHotspots`
 *                        (distinct `target_id` where category =
 *                         'unfulfilled_demand' AND target_type = 'role')
 *
 * The pending-requests value is published to `setPendingRequestsKpi`
 * on the CapacityScope context so `CapacityModuleNav` can show the
 * same number in the "Requests" badge without a duplicate fetch
 * (Lead handles the badge wiring in the integration commit).
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md sec.5.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Inbox,
  GitMerge,
} from 'lucide-react';
import { capacityApi } from '@/api/endpoints';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import { cn } from '@/lib/utils';

// --- Local types --------------------------------------------------------

interface KpiSnapshot {
  headcount: number;
  avgUtilizationPct: number;
  overAllocatedCount: number;
  /** null when inbox fetch failed for a role that should have access
   *  (Controller / CC Owner — network blip). Card renders '—' so a
   *  transient failure doesn't silently overwrite the side-nav badge. */
  pendingRequestsCount: number | null;
  supplyGapRoleCount: number;
  windowStart: string | null;
  windowEnd: string | null;
  windowMonthCount: number;
}

const EMPTY_SNAPSHOT: KpiSnapshot = {
  headcount: 0,
  avgUtilizationPct: 0,
  overAllocatedCount: 0,
  pendingRequestsCount: 0,
  supplyGapRoleCount: 0,
  windowStart: null,
  windowEnd: null,
  windowMonthCount: 0,
};

// Hotspot fetch limit -- tuned high enough to cover the full demo
// dataset so the over-allocated and supply-gap counts aren't truncated
// by the default top-N limit.
const HOTSPOT_LIMIT = 200;

// --- Card descriptors ---------------------------------------------------

interface KpiCardDef {
  key: 'headcount' | 'avg_util' | 'over_alloc' | 'pending_req' | 'supply_gap';
  label: string;
  icon: ReactNode;
  filter: FilterChipKey | null;
}

const CARDS: KpiCardDef[] = [
  {
    key: 'headcount',
    label: 'Headcount',
    icon: <Users className="h-4 w-4" />,
    filter: null,
  },
  {
    key: 'avg_util',
    label: 'Avg utilization',
    icon: <TrendingUp className="h-4 w-4" />,
    filter: null,
  },
  {
    key: 'over_alloc',
    label: 'Over-allocated',
    icon: <AlertTriangle className="h-4 w-4" />,
    filter: 'over_allocated',
  },
  {
    key: 'pending_req',
    label: 'Pending requests',
    icon: <Inbox className="h-4 w-4" />,
    filter: 'pending_requests',
  },
  {
    key: 'supply_gap',
    label: 'Supply gap',
    icon: <GitMerge className="h-4 w-4" />,
    filter: 'unassigned_months',
  },
];

// --- Helpers ------------------------------------------------------------

/** Format an ISO month (`YYYY-MM` or `YYYY-MM-DD`) as `MMM YYYY`. */
function formatMonth(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (Number.isNaN(year) || monthIdx < 0 || monthIdx > 11) return iso;
  const date = new Date(Date.UTC(year, monthIdx, 1));
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format a percentage with European decimals (1 decimal place). */
function formatPct(pct: number): string {
  // European convention: comma decimal separator (CLAUDE.md).
  const fixed = pct.toFixed(1).replace('.', ',');
  return `${fixed}%`;
}

// --- Component ----------------------------------------------------------

export interface KPISummaryBarProps {
  className?: string;
}

export function KPISummaryBar({ className }: KPISummaryBarProps) {
  const { scope, ccId, activeFilters, setActiveFilters, setPendingRequestsKpi } =
    useCapacityScope();

  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);
  const [snapshot, setSnapshot] = useState<KpiSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const inboxFilters =
      scope.kind === 'my_cc' && ccId
        ? { status: 'all' as const, cost_center_id: [ccId] }
        : { status: 'all' as const };

    setLoading(true);
    setError(null);

    // Use allSettled so a single failing endpoint (e.g. getInbox returns
    // 403 for Executive per §12.1) doesn't blank every KPI card.
    Promise.allSettled([
      capacityApi.getDashboardHeadcountBreakdown(apiScope, 'role'),
      capacityApi.getDashboardForecast(apiScope),
      capacityApi.getDashboardHotspots(apiScope, HOTSPOT_LIMIT),
      capacityApi.getInbox(inboxFilters),
    ])
      .then(([headcountResult, forecastResult, hotspotsResult, inboxResult]) => {
        if (cancelled) return;

        const headcount =
          headcountResult.status === 'fulfilled' ? headcountResult.value : null;
        const forecast =
          forecastResult.status === 'fulfilled' ? forecastResult.value : null;
        const hotspots =
          hotspotsResult.status === 'fulfilled' ? hotspotsResult.value : null;
        const inbox =
          inboxResult.status === 'fulfilled' ? inboxResult.value : null;

        const items = forecast?.items ?? [];
        const totals = items.reduce(
          (acc, point) => {
            acc.allocated += point.allocated_hours ?? 0;
            acc.available += point.available_hours ?? 0;
            return acc;
          },
          { allocated: 0, available: 0 },
        );

        const avgUtilizationPct =
          totals.available > 0
            ? (totals.allocated / totals.available) * 100
            : 0;

        const overAllocatedPersons = new Set<string>();
        const supplyGapRoles = new Set<string>();
        for (const item of hotspots?.items ?? []) {
          if (
            item.category === 'over_allocation' &&
            item.target_type === 'person'
          ) {
            overAllocatedPersons.add(item.target_id);
          } else if (
            item.category === 'unfulfilled_demand' &&
            item.target_type === 'role'
          ) {
            supplyGapRoles.add(item.target_id);
          }
        }

        const inboxOk = inboxResult.status === 'fulfilled';
        let pendingRequestsCount = 0;
        for (const inboxItem of inbox?.items ?? []) {
          for (const badge of inboxItem.role_badges ?? []) {
            pendingRequestsCount += badge.count;
          }
        }

        const next: KpiSnapshot = {
          headcount: headcount?.total ?? 0,
          avgUtilizationPct,
          overAllocatedCount: overAllocatedPersons.size,
          // When inbox failed but the role *expects* it (Controller / CC
          // Owner), null preserves the previous side-nav badge value
          // rather than silently flashing 0. The card itself shows '—'
          // for null. Executive 403s are normal — we always render 0.
          pendingRequestsCount: inboxOk ? pendingRequestsCount : null,
          supplyGapRoleCount: supplyGapRoles.size,
          windowStart: forecast?.start ?? items[0]?.month ?? null,
          windowEnd:
            forecast?.end ?? items[items.length - 1]?.month ?? null,
          windowMonthCount: items.length,
        };

        setSnapshot(next);
        // Only publish to the side-nav seam when we have a real number.
        // The seam consumer (CapacityModuleNav) keeps the prior badge
        // when this stays null, avoiding a transient "0" flash.
        if (inboxOk) {
          setPendingRequestsKpi(pendingRequestsCount);
        }

        // Surface a banner only if ALL endpoints failed — partial
        // failures (Executive's missing inbox) just degrade gracefully.
        const allFailed = [headcountResult, forecastResult, hotspotsResult]
          .every((r) => r.status === 'rejected');
        if (allFailed) {
          const firstReason = [headcountResult, forecastResult, hotspotsResult]
            .find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
          const reason = firstReason?.reason;
          setError(reason instanceof Error ? reason.message : 'Failed to load KPIs');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // setPendingRequestsKpi is stable from context (memoized provider value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiScope, scope.kind, ccId]);

  const handleCardClick = (filter: FilterChipKey | null) => {
    if (!filter) return;
    // Mirror FilterChipBar.handleClick: a click toggles a specific
    // chip and AND-combines with any other active specifics (§6.2).
    // Re-clicking an already-active card removes it (the normalizer
    // falls back to ['all'] when no specifics remain). Replacing the
    // whole filter set would be inconsistent with the chip bar.
    if (activeFilters.includes(filter)) {
      setActiveFilters(activeFilters.filter((f) => f !== filter));
      return;
    }
    const next = activeFilters.filter((f) => f !== 'all');
    next.push(filter);
    setActiveFilters(next);
  };

  const isActive = (filter: FilterChipKey | null) =>
    !!filter && activeFilters.includes(filter);

  // --- Card value/sub-text rendering ------------------------------------

  const cardValue = (key: KpiCardDef['key']): string => {
    switch (key) {
      case 'headcount':
        return loading ? '—' : String(snapshot.headcount);
      case 'avg_util':
        return loading ? '—' : formatPct(snapshot.avgUtilizationPct);
      case 'over_alloc':
        return loading ? '—' : String(snapshot.overAllocatedCount);
      case 'pending_req':
        if (loading) return '—';
        return snapshot.pendingRequestsCount === null
          ? '—'
          : String(snapshot.pendingRequestsCount);
      case 'supply_gap':
        return loading
          ? '—'
          : `${snapshot.supplyGapRoleCount} ${
              snapshot.supplyGapRoleCount === 1 ? 'role' : 'roles'
            }`;
    }
  };

  const cardSubText = (key: KpiCardDef['key']): string | null => {
    switch (key) {
      case 'avg_util':
        return snapshot.windowStart && snapshot.windowEnd
          ? `${formatMonth(snapshot.windowStart)}–${formatMonth(
              snapshot.windowEnd,
            )} window`
          : null;
      case 'over_alloc':
        return snapshot.windowMonthCount > 0
          ? `across ${snapshot.windowMonthCount} months`
          : null;
      case 'supply_gap':
        return 'demand > available';
      default:
        return null;
    }
  };

  return (
    <div
      className={cn('grid gap-3', className)}
      style={{
        // sec.5.1 -- responsive grid, minmax(140px, 1fr).
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}
      role="group"
      aria-label="Capacity KPI summary"
    >
      {CARDS.map((card) => {
        const active = isActive(card.filter);
        const clickable = card.filter !== null;
        const subText = cardSubText(card.key);

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => handleCardClick(card.filter)}
            disabled={!clickable}
            aria-pressed={clickable ? active : undefined}
            className={cn(
              'group flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors',
              clickable
                ? 'cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
                : 'cursor-default',
              active
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card',
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <span
                className={cn(
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {card.icon}
              </span>
              <span className="text-xs">{card.label}</span>
            </div>
            <div
              className={cn(
                'text-2xl font-semibold leading-none',
                error || loading
                  ? 'text-muted-foreground'
                  : 'text-foreground',
              )}
            >
              {error ? '—' : cardValue(card.key)}
            </div>
            {subText && (
              <div className="text-[11px] leading-tight text-muted-foreground">
                {subText}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default KPISummaryBar;
