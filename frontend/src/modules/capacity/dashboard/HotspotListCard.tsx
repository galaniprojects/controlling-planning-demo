/**
 * HotspotListCard — v5.2 W4 Track B (§11.6).
 *
 * Ranked list of the top capacity issues. No chart library — plain HTML/CSS.
 *
 * Row click behavior (per user decision 2a):
 *   - Over-allocation    → openPerson(ccId, personId) — target_type='person'
 *   - Under-utilization  → openPerson(ccId, personId) — target_type='person'
 *   - Unfulfilled demand → openCell({...demand payload}) — target_type='role'
 *
 * For person hotspots, the backend target_id is the person_id. The hotspot
 * payload does not carry cc_id, so we derive it from the person's cost_center
 * context via a separate lookup. When the cc_id is unknown we use the
 * apiScope fallback so the side panel can still fetch person data.
 *
 * The "View all" toggle reveals all issues in a scrollable container.
 * Empty state shows a green checkmark.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.6
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, TrendingDown, CheckCircle } from 'lucide-react';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { capacityApi } from '@/api/endpoints';
import { scopeToApiParam } from '@/lib/capacityScopeApi';
import { useCapacitySidePanel } from '../sidepanel/CapacitySidePanelContext';
import type { HotspotItem } from '@/types/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Default limit for the top-N display (show all once expanded).
const DEFAULT_LIMIT = 5;

/**
 * Fetch all hotspots with a high limit so we can show both the top-5 and
 * the "View all" expansion without a second fetch.
 */
const FETCH_LIMIT = 50;

function severityIcon(category: string) {
  switch (category) {
    case 'over_allocation':
      return (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
      );
    case 'unfulfilled_demand':
      return (
        <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
      );
    case 'under_utilization':
      return (
        <TrendingDown className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
      );
    default:
      return (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      );
  }
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface HotspotRowProps {
  item: HotspotItem;
  ccId: string | null;
  apiScope: string;
  onPerson: (ccId: string, personId: string) => void;
  onCell: (args: {
    dimensionId: string;
    pivot: string;
    month?: string;
    rowLabel: string;
  }) => void;
}

function HotspotRow({ item, ccId, apiScope, onPerson, onCell }: HotspotRowProps) {
  const handleClick = () => {
    if (
      item.category === 'over_allocation' ||
      item.category === 'under_utilization'
    ) {
      // target_type = 'person', target_id = person_id.
      // We need a cc_id to call openPerson. Use the workspace ccId when
      // available (my_cc scope) or fall back to the apiScope string as a
      // best-effort cc identifier (the endpoint will resolve it).
      // In all_ccs scope ccId is null; we pass the apiScope token and let
      // the side panel degrade gracefully.
      const resolvedCcId =
        ccId ?? (apiScope.startsWith('cost_center:') ? apiScope.slice(12) : '');
      onPerson(resolvedCcId, item.target_id);
    } else if (item.category === 'unfulfilled_demand') {
      // target_type = 'role', target_id = role_type_id.
      // Synthesize a demand-cell payload per user decision 2a.
      onCell({
        dimensionId: 'demand',
        pivot: 'role',
        rowLabel: item.summary.split('—')[0]?.trim() ?? item.target_id,
      });
    }
  };

  const ariaAction =
    item.category === 'unfulfilled_demand'
      ? 'Open demand summary'
      : 'Open person detail';

  return (
    <button
      type="button"
      aria-label={`${ariaAction} for ${item.summary}`}
      className={cn(
        'flex w-full items-start gap-2 rounded px-1.5 py-1.5 text-left',
        'transition-colors hover:bg-accent/50 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
      onClick={handleClick}
    >
      <span className="mt-0.5" aria-hidden="true">{severityIcon(item.category)}</span>
      <span className="text-[11px] leading-snug text-foreground">
        {item.summary}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function HotspotListCard() {
  const { scope, ccId } = useCapacityScope();
  const apiScope = useMemo(() => scopeToApiParam(scope, ccId), [scope, ccId]);
  const { openPerson, openCell } = useCapacitySidePanel();

  const [allItems, setAllItems] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpanded(false);
    capacityApi
      .getDashboardHotspots(apiScope, FETCH_LIMIT)
      .then((res) => {
        if (cancelled) return;
        setAllItems(res.items ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load hotspots');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiScope]);

  const visibleItems = expanded ? allItems : allItems.slice(0, DEFAULT_LIMIT);
  const hasMore = allItems.length > DEFAULT_LIMIT;
  const isEmpty = !loading && !error && allItems.length === 0;

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Capacity Hotspots
      </p>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-1 items-center justify-center text-xs text-destructive">
          {error}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" />
          <p className="text-xs text-muted-foreground">No capacity issues detected</p>
        </div>
      )}

      {!loading && !error && !isEmpty && (
        <div className="flex flex-1 flex-col">
          {/* Scrollable list when expanded */}
          <div
            className={cn(
              'flex-1 space-y-0.5 overflow-y-auto',
              expanded && 'max-h-[300px]',
            )}
          >
            {visibleItems.map((item, i) => (
              <HotspotRow
                key={`${item.category}-${item.target_id}-${i}`}
                item={item}
                ccId={ccId}
                apiScope={apiScope}
                onPerson={openPerson}
                onCell={openCell}
              />
            ))}
          </div>

          {/* Footer: View all / Show less */}
          {hasMore && (
            <button
              type="button"
              className="mt-1 self-start text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Show less'
                : `View all (${allItems.length} issues)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default HotspotListCard;
