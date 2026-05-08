/**
 * CellDetail — v5.2 W3 Track C (spec §7.3) + v5.2 W5 Track A (spec §9.1).
 *
 * Renders inside the shared `SidePanel` when the user clicks a cell on
 * an aggregate row in the Org-level view (scope = All CCs / location /
 * hierarchy node). Width is fixed at 280px by
 * `CapacitySidePanelContext`'s width-per-mode policy. Replaces the
 * legacy `OrgDetailDrawer` content surface.
 *
 * Sections rendered (top to bottom, per spec §7.3):
 *
 *   1. Header — row label + month/quarter/year (the panel chrome
 *      already shows the title; this body adds a qualified
 *      dimension-type pill via `LocationLabel` when the pivot is
 *      `location`, so the user can disambiguate between Workforce
 *      Locations, Charging Locations and Legal Entities).
 *   2. Summary block — Allocated / Available / Delta (delta green when
 *      positive, red when negative).
 *   3. Project allocations list — one row per project with hours in
 *      this slice. Each row is expandable to show per-person hours.
 *      Project name links to `/workbench?project={id}`.
 *
 * v5.2 W5 Track A (S6b §9.1 entry-point #2): when `pivot === 'demand'`,
 * the body switches to a pending-demand list — one row per project
 * with open RRs in the user's scope, each with a "Review project"
 * button that opens assignment mode for that project. This is the
 * surface the demand strip click lands on.
 *
 * Cross-fade: the outer wrapper is keyed on the cell payload so React
 * remounts the subtree on mode/payload changes, kicking off the 200ms
 * `animate-in fade-in-0` animation called for in spec §7.4.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { capacityApi } from '@/api/endpoints';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import type {
  CapacityInboxItem,
  OrgDetailItem,
  OrgDetailResponse,
} from '@/types/api';
import { useCapacitySidePanel } from './CapacitySidePanelContext';

interface CellDetailProps {
  dimensionId: string;
  /** e.g., 'role' | 'cost_center' | 'location' | 'hierarchy'. */
  pivot: string;
  /** Optional month focus (`YYYY-MM`). */
  month?: string;
  /** Human-readable row label (e.g., 'MUC' or 'App Development'). */
  rowLabel: string;
}

export function CellDetail({
  dimensionId,
  pivot,
  month,
  rowLabel,
}: CellDetailProps) {
  // §9.1 entry-point #2 — the demand strip routes here with pivot='demand'.
  // Branch out to a separate body so the `getOrgHeatmapDetail` call (which
  // would 4xx on this synthetic pivot) never fires.
  if (pivot === 'demand') {
    return (
      <div
        key={`demand:${month ?? ''}`}
        className="animate-in fade-in-0 duration-200 space-y-4"
      >
        <CellHeader pivot={pivot} rowLabel={rowLabel} month={month} />
        <DemandCellBody month={month} />
      </div>
    );
  }
  return <OrgCellDetail dimensionId={dimensionId} pivot={pivot} month={month} rowLabel={rowLabel} />;
}

function OrgCellDetail({
  dimensionId,
  pivot,
  month,
  rowLabel,
}: CellDetailProps) {
  const [data, setData] = useState<OrgDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExpanded(new Set());
    capacityApi
      .getOrgHeatmapDetail(dimensionId, pivot, month)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimensionId, pivot, month]);

  // Wrapper keyed on the cell payload so React remounts the subtree on
  // every navigation, kicking off the 200ms cross-fade described in §7.4.
  return (
    <div
      key={`${dimensionId}:${pivot}:${month ?? ''}`}
      className="animate-in fade-in-0 duration-200 space-y-4"
    >
      <CellHeader pivot={pivot} rowLabel={rowLabel} month={month} />

      {loading ? (
        <CellDetailSkeleton />
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No project allocations for this period.
        </p>
      ) : (
        <CellDetailBody
          data={data}
          expanded={expanded}
          onToggle={(projectId) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(projectId)) next.delete(projectId);
              else next.add(projectId);
              return next;
            })
          }
        />
      )}
    </div>
  );
}

function CellHeader({
  pivot,
  rowLabel,
  month,
}: {
  pivot: string;
  rowLabel: string;
  month?: string;
}) {
  return (
    <header className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground truncate" title={rowLabel}>
          {rowLabel}
        </h3>
        {month && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {month}
          </span>
        )}
      </div>
      {pivot === 'location' && (
        // Qualified pill — disambiguates Workforce vs Charging vs Legal
        // for the rare case where a user lands here from a charging or
        // legal-entity surface and isn't sure which "location" applies.
        <div className="text-[11px] text-muted-foreground">
          Dimension:{' '}
          <LocationLabel kind="workforce" iconOnly className="align-middle" />
          <span className="ml-1 align-middle">Workforce Locations</span>
        </div>
      )}
    </header>
  );
}

function CellDetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

function CellDetailBody({
  data,
  expanded,
  onToggle,
}: {
  data: OrgDetailResponse;
  expanded: Set<string>;
  onToggle: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const deltaPositive = data.delta >= 0;

  return (
    <>
      {/* Summary block: Allocated / Available / Delta */}
      <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <SummaryStat label="Allocated" value={`${Math.round(data.allocated_hours)}h`} />
        <SummaryStat label="Available" value={`${Math.round(data.available_hours)}h`} />
        <SummaryStat
          label="Delta"
          value={`${deltaPositive ? '+' : ''}${Math.round(data.delta)}h`}
          tone={deltaPositive ? 'positive' : 'negative'}
        />
      </div>

      {/* Project allocations list */}
      <section className="space-y-1.5">
        <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Project allocations
        </h4>
        <ul className="space-y-0">
          {data.items.map((item) => (
            <ProjectRow
              key={item.project_id}
              item={item}
              isExpanded={expanded.has(item.project_id)}
              onToggle={() => onToggle(item.project_id)}
              onNavigate={() =>
                navigate(`/workbench?project=${item.project_id}`)
              }
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'positive' && 'text-green-600 dark:text-green-400',
          tone === 'negative' && 'text-red-600 dark:text-red-400',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ProjectRow({
  item,
  isExpanded,
  onToggle,
  onNavigate,
}: {
  item: OrgDetailItem;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasEmployees = !!item.employees && item.employees.length > 0;

  return (
    <li className="border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 py-1.5">
        {hasEmployees ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={isExpanded ? 'Collapse employees' : 'Expand employees'}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={onNavigate}
          className="flex-1 truncate text-left text-sm text-foreground hover:text-primary hover:underline"
          title={item.project_name}
        >
          {item.project_name}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {item.hours_allocated.toFixed(0)}h
        </span>
      </div>

      {isExpanded && hasEmployees && (
        <ul className="space-y-0.5 pb-2 pl-7">
          {item.employees!.map((emp) => (
            <li
              key={emp.person_id}
              className="flex items-center justify-between text-xs text-muted-foreground"
            >
              <span className="truncate" title={emp.person_name}>
                {emp.person_name}
              </span>
              <span className="shrink-0 tabular-nums">{emp.hours.toFixed(0)}h</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Demand-mode body (v5.2 W5 Track A — S6b §9.1 entry-point #2)
// ---------------------------------------------------------------------------

/**
 * Demand-mode body — lists pending resource requests aggregated by
 * project. Each row exposes a "Review project" button that calls
 * `openAssignment(projectId, { ccId, crId })`, which transitions the
 * side panel from the demand list to a 400px assignment session for
 * that parent project.
 *
 * Data source: `getInbox()` — returns active project rows visible to
 * the user's role. The inbox already aggregates pending demand per
 * (project × CC) and surfaces role badges + unassigned-hours, which
 * is exactly the surface §9.1 calls for. We don't filter by clicked
 * month: the inbox endpoint doesn't expose per-request periods, and
 * any request listed there is, by definition, currently un- or
 * partially fulfilled and therefore relevant to "demand for this
 * period". The clicked month is shown in the panel header so the
 * user retains spatial context.
 */
function DemandCellBody({ month: _month }: { month?: string }) {
  void _month;
  const [items, setItems] = useState<CapacityInboxItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { openAssignment } = useCapacitySidePanel();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    capacityApi
      .getInbox()
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <CellDetailSkeleton />;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load demand: {error}</p>
    );
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending requests in scope.
      </p>
    );
  }

  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Pending requests ({items.length})
      </h4>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={`${it.project_id}:${it.cc_id}:${it.cr_id ?? 'baseline'}`}
            className="rounded-md border border-border p-2.5"
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className="truncate text-sm font-medium text-foreground"
                title={it.project_name}
              >
                {it.project_name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {Math.round(it.unassigned_hours)}h open
              </span>
            </div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="truncate">{it.cc_name}</span>
              {it.pl_name ? <span>· {it.pl_name}</span> : null}
              {it.cr_id != null ? (
                <span className="rounded-sm border border-blue-300 bg-blue-50 px-1 py-px text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  CR {it.cr_id}
                </span>
              ) : null}
            </div>
            {it.role_badges.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {it.role_badges.map((b) => (
                  <span
                    key={b.role_type_id}
                    className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title={`${b.role_name}: ${b.count} request${b.count === 1 ? '' : 's'}`}
                  >
                    {b.role_name} ×{b.count}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                openAssignment(it.project_id, {
                  ccId: it.cc_id,
                  crId: it.cr_id ?? undefined,
                })
              }
              className={cn(
                'w-full rounded-sm border border-primary/30 bg-primary/10 px-2 py-1',
                'text-[11px] font-medium text-primary',
                'hover:bg-primary/20 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              )}
            >
              Review project
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
