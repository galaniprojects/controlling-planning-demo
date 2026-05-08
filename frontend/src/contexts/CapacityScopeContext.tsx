/**
 * CapacityScopeContext — v5.2 W2 Track A.
 *
 * Holds the workspace's scope + group-by state for the Capacity Module
 * redesign. The context is the single source of truth read by ScopeBar,
 * the (W3) KPI bar, the (W3) timeline, and the (W3) demand strip.
 *
 * Spec references:
 *   - guides/Capacity_Module_Redesign_Spec.md §2 (scope model)
 *   - guides/Capacity_Module_Redesign_Implementation_Guide.md §S2
 *
 * Scope encoding (URL + state):
 *   - `my_cc`     CC-Owner default; for Controller, paired with `ccId`
 *                  selected from the dropdown.
 *   - `all_ccs`   Controller / Executive default.
 *   - `loc:<id>`  Filter by Location.
 *   - `hier:<id>` Filter by top-level hierarchy node (LoB by default).
 *
 * Group-by values: `role` (default) | `project` | `person`.
 *
 * W2 only wires state + URL persistence; no data fetches happen off the
 * context yet (W3 connects KPI bar / timeline).
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// --- Types ---

export type ScopeKind = 'my_cc' | 'all_ccs' | 'location' | 'hierarchy';
export type GroupBy = 'role' | 'project' | 'person';

/**
 * v5.2 W3 §6 — smart filter chip identifiers.
 *
 *  - `all`              — default; no row filtering.
 *  - `over_allocated`   — people with any month >100% in visible window.
 *  - `under_utilized`   — people with avg utilization < threshold (40%).
 *  - `pending_requests` — people who are `assigned_person_id` on any pending RR.
 *  - `unassigned_months`— people linked to RRs with un-assigned month cells.
 *
 * Mutual exclusivity rule: `all` and any specific chip cannot both be active.
 * Multiple specific chips combine with AND logic.
 */
export type FilterChipKey =
  | 'all'
  | 'over_allocated'
  | 'under_utilized'
  | 'pending_requests'
  | 'unassigned_months';

export interface CapacityScope {
  kind: ScopeKind;
  /** Optional id payload: location id (kind=location) or hierarchy node id (kind=hierarchy). */
  id?: string;
}

interface CapacityScopeState {
  scope: CapacityScope;
  groupBy: GroupBy;
  /** Currently-selected CC id (Controller `My CC` dropdown selection, or CC-Owner's pinned CC). */
  ccId: string | null;
  /** v5.2 W3 §6 — currently-active filter chip keys. Defaults to ['all']. */
  activeFilters: FilterChipKey[];
  /**
   * v5.2 W3 §5.2 — pending-requests KPI value, published by KPISummaryBar
   * so CapacityModuleNav (and other surfaces) can read the same number
   * without a duplicate fetch. Null until the KPI bar mounts.
   */
  pendingRequestsKpi: number | null;
  setScope: (next: CapacityScope) => void;
  setGroupBy: (next: GroupBy) => void;
  setCcId: (id: string | null) => void;
  /** Replace the active filter set, enforcing the `all` mutual-exclusivity rule. */
  setActiveFilters: (next: FilterChipKey[]) => void;
  setPendingRequestsKpi: (n: number | null) => void;
}

/**
 * Normalize a candidate filter set to the mutual-exclusivity rules:
 *   - empty list   → ['all']
 *   - contains 'all' alongside specifics → drop specifics, keep ['all']
 *     (UNLESS the *only* difference from the prior state is that a
 *     specific filter was added — handled by callers, not here)
 *   - contains specifics only → strip 'all', dedupe
 */
export function normalizeActiveFilters(
  next: readonly FilterChipKey[],
): FilterChipKey[] {
  const set = new Set(next);
  if (set.size === 0) return ['all'];
  if (set.has('all') && set.size > 1) {
    set.delete('all');
  }
  return Array.from(set);
}

const CapacityScopeCtx = createContext<CapacityScopeState | null>(null);

// --- Default-by-role helper ---

/**
 * Returns the default scope for a given role.
 *   CC-Owner (`cost_center_owner`) → `my_cc`
 *   Controller / Executive          → `all_ccs`
 *   PL → `all_ccs` (PL is gated out of /capacity, but a sane fallback
 *                   keeps the type narrow).
 */
export function defaultScopeForRole(role: string | undefined): CapacityScope {
  if (role === 'cost_center_owner') return { kind: 'my_cc' };
  return { kind: 'all_ccs' };
}

// --- Encoding helpers ---

const SCOPE_PARAM_KEYS = new Set(['my_cc', 'all_ccs']);

/** Serialize a scope object to its URL query-param string. */
export function encodeScope(scope: CapacityScope): string {
  switch (scope.kind) {
    case 'my_cc':
      return 'my_cc';
    case 'all_ccs':
      return 'all_ccs';
    case 'location':
      return scope.id ? `loc:${scope.id}` : 'all_ccs';
    case 'hierarchy':
      return scope.id ? `hier:${scope.id}` : 'all_ccs';
    default:
      return 'all_ccs';
  }
}

/** Parse a URL `?scope=…` value back into a CapacityScope. */
export function decodeScope(value: string | null | undefined): CapacityScope | null {
  if (!value) return null;
  if (SCOPE_PARAM_KEYS.has(value)) {
    return { kind: value as 'my_cc' | 'all_ccs' };
  }
  if (value.startsWith('loc:')) {
    const id = value.slice(4);
    return id ? { kind: 'location', id } : null;
  }
  if (value.startsWith('hier:')) {
    const id = value.slice(5);
    return id ? { kind: 'hierarchy', id } : null;
  }
  return null;
}

export function isValidGroupBy(value: string | null | undefined): value is GroupBy {
  return value === 'role' || value === 'project' || value === 'person';
}

// --- Provider ---

export interface CapacityScopeProviderProps {
  children: ReactNode;
  /** Initial scope (resolved from role + URL by the layout shell). */
  initialScope?: CapacityScope;
  /** Initial group-by (resolved from URL or defaults to `role`). */
  initialGroupBy?: GroupBy;
  /** Initial CC id (Controller dropdown selection or CC-Owner's pinned CC). */
  initialCcId?: string | null;
}

export function CapacityScopeProvider({
  children,
  initialScope = { kind: 'all_ccs' },
  initialGroupBy = 'role',
  initialCcId = null,
}: CapacityScopeProviderProps) {
  const [scope, setScope] = useState<CapacityScope>(initialScope);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [ccId, setCcId] = useState<string | null>(initialCcId);
  const [activeFilters, setActiveFiltersState] = useState<FilterChipKey[]>([
    'all',
  ]);
  const [pendingRequestsKpi, setPendingRequestsKpi] = useState<number | null>(
    null,
  );

  const setActiveFilters = (next: FilterChipKey[]) => {
    setActiveFiltersState(normalizeActiveFilters(next));
  };

  const value = useMemo<CapacityScopeState>(
    () => ({
      scope,
      groupBy,
      ccId,
      activeFilters,
      pendingRequestsKpi,
      setScope,
      setGroupBy,
      setCcId,
      setActiveFilters,
      setPendingRequestsKpi,
    }),
    [scope, groupBy, ccId, activeFilters, pendingRequestsKpi],
  );

  return (
    <CapacityScopeCtx.Provider value={value}>{children}</CapacityScopeCtx.Provider>
  );
}

export function useCapacityScope() {
  const ctx = useContext(CapacityScopeCtx);
  if (!ctx) {
    throw new Error('useCapacityScope must be used inside CapacityScopeProvider');
  }
  return ctx;
}
