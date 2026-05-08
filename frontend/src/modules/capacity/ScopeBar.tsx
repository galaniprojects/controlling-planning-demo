/**
 * ScopeBar — v5.2 W2 Track A (Capacity Module Redesign §2.1–§2.3).
 *
 * Horizontal pill row driving the Capacity workspace scope:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  [Scope] All CCs · My CC · Munich · Budapest · TBS · RVS … │
 *   │  [Group by] Role · Project · Person                         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Behavior summary:
 *  - Scope group (single-select):  My CC | All CCs | per-Location | per-Hierarchy-node.
 *  - Group group (single-select):  Role | Project | Person.
 *  - Locations and hierarchy nodes with zero headcount are hidden
 *    (location filter uses `cost_center_count` as a cheap proxy until
 *     a richer headcount endpoint lands in W3).
 *  - Controller `My CC` selection: Select dropdown next to the pill,
 *    replaces the legacy `CapacityManagement.tsx:77–95` selector.
 *  - Executive: `My CC` pill hidden (no managed CC).
 *  - URL persistence is handled by `useScopeQueryParams`.
 *
 * W2 only: changing pills updates `CapacityScopeContext`; downstream
 * fetches (KPIs, timeline) connect in W3.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRole } from '@/contexts/RoleContext';
import {
  useCapacityScope,
  type CapacityScope,
  type GroupBy,
} from '@/contexts/CapacityScopeContext';
import { referenceApi } from '@/api/endpoints';
import type { LoBRef, RefCostCenter, RefLocation } from '@/types/api';

interface ScopePill {
  key: string;
  label: string;
  scope: CapacityScope;
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'role', label: 'Role' },
  { value: 'project', label: 'Project' },
  { value: 'person', label: 'Person' },
];

/**
 * Pill button — semantic-token Tailwind so it renders correctly in
 * both light and dark themes.
 */
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        'inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium',
        'border transition-colors whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function ScopeBar() {
  const { context } = useRole();
  const role = context?.role;
  const managedCcId = context?.managed_cost_center_id ?? null;

  const { scope, groupBy, ccId, setScope, setGroupBy, setCcId } =
    useCapacityScope();

  const isController = role === 'controller';
  const isExecutive = role === 'executive';
  const isCcOwner = role === 'cost_center_owner';
  const showMyCcPill = isController || isCcOwner;

  // ---- Reference data ----
  const [locations, setLocations] = useState<RefLocation[]>([]);
  const [hierarchyNodes, setHierarchyNodes] = useState<LoBRef[]>([]);
  const [costCenters, setCostCenters] = useState<RefCostCenter[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      referenceApi.getLocations(),
      referenceApi.getLobs(),
      referenceApi.getCostCenters(),
    ])
      .then(([locs, lobs, ccs]) => {
        if (cancelled) return;
        setLocations(locs.items);
        setHierarchyNodes(lobs.items);
        setCostCenters(ccs.items);
      })
      .catch(() => {
        // Reference data is best-effort in W2; pills simply won't render.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Pin CC-Owner's CC into context once the role context is ready ----
  useEffect(() => {
    if (isCcOwner && managedCcId && !ccId) {
      setCcId(managedCcId);
    }
  }, [isCcOwner, managedCcId, ccId, setCcId]);

  // ---- Build pills ----
  const locationPills: ScopePill[] = useMemo(
    () =>
      locations
        .filter((loc) => loc.is_active && loc.cost_center_count > 0)
        .map((loc) => ({
          key: `loc:${loc.id}`,
          label: loc.city,
          scope: { kind: 'location' as const, id: loc.id },
        })),
    [locations],
  );

  const hierarchyPills: ScopePill[] = useMemo(
    () =>
      hierarchyNodes
        .filter((lob) => lob.is_active && lob.project_count > 0)
        .map((lob) => ({
          key: `hier:${lob.id}`,
          label: lob.name,
          scope: { kind: 'hierarchy' as const, id: lob.id },
        })),
    [hierarchyNodes],
  );

  const sortedCostCenters = useMemo(
    () =>
      [...costCenters]
        .filter((cc) => cc.is_active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [costCenters],
  );

  // ---- Active-pill matchers ----
  const isMyCcActive = scope.kind === 'my_cc';
  const isAllCcsActive = scope.kind === 'all_ccs';
  const activeLocationId = scope.kind === 'location' ? scope.id : undefined;
  const activeHierarchyId = scope.kind === 'hierarchy' ? scope.id : undefined;

  // ---- Handlers ----
  const handleSelectMyCc = () => {
    setScope({ kind: 'my_cc' });
    if (isCcOwner && managedCcId) {
      setCcId(managedCcId);
    }
    // For Controller: keep the previously-picked ccId (if any) so the
    // dropdown doesn't appear empty after toggling away and back. The
    // Select still defaults to first option below if ccId is null.
  };

  const handleSelectAllCcs = () => {
    setScope({ kind: 'all_ccs' });
  };

  const handleSelectLocation = (id: string) => {
    setScope({ kind: 'location', id });
  };

  const handleSelectHierarchy = (id: string) => {
    setScope({ kind: 'hierarchy', id });
  };

  // ---- Render ----
  return (
    <div className="space-y-2">
      {/* Scope row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1">
          Scope
        </span>

        <Pill active={isAllCcsActive} onClick={handleSelectAllCcs}>
          All CCs
        </Pill>

        {showMyCcPill && (
          <Pill active={isMyCcActive} onClick={handleSelectMyCc}>
            My CC
          </Pill>
        )}

        {/* Controller-only CC dropdown when scope=my_cc */}
        {isController && isMyCcActive && (
          <Select
            value={ccId ?? sortedCostCenters[0]?.id ?? ''}
            onValueChange={(v) => setCcId(v)}
          >
            <SelectTrigger className="h-8 w-[260px] text-xs">
              <SelectValue placeholder="Select cost centre" />
            </SelectTrigger>
            <SelectContent>
              {sortedCostCenters.map((cc) => (
                <SelectItem key={cc.id} value={cc.id}>
                  {cc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Visual divider before Locations */}
        {locationPills.length > 0 && (
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        )}
        {locationPills.map((p) => (
          <Pill
            key={p.key}
            active={activeLocationId === p.scope.id}
            onClick={() => handleSelectLocation(p.scope.id!)}
          >
            {p.label}
          </Pill>
        ))}

        {/* Visual divider before Hierarchy */}
        {hierarchyPills.length > 0 && (
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        )}
        {hierarchyPills.map((p) => (
          <Pill
            key={p.key}
            active={activeHierarchyId === p.scope.id}
            onClick={() => handleSelectHierarchy(p.scope.id!)}
          >
            {p.label}
          </Pill>
        ))}
      </div>

      {/* Group-by row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1">
          Group by
        </span>
        {GROUP_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={groupBy === opt.value}
            onClick={() => setGroupBy(opt.value)}
          >
            {opt.label}
          </Pill>
        ))}
        {/* Read-only nudge for Executives — no write actions show in W2,
            but we surface the gating signal up front per spec §2.5. */}
        {isExecutive && (
          <span className="ml-2 text-xs text-muted-foreground">
            Read-only view
          </span>
        )}
      </div>
    </div>
  );
}

export default ScopeBar;
