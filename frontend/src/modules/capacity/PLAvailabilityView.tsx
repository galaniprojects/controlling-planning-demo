/**
 * PLAvailabilityView — v5.2 W4 Track C (spec §13), W6 S11 (slide-over mode §13.9)
 *
 * Project Lead read-only capacity view. Routes:
 *   - /capacity/availability             (mode='page', default)
 *   - Inside the WideSlideOver           (mode='slideover', via PLAvailabilitySlideOver)
 *
 * Self-contained — no dependency on CapacityScopeContext. Owns its own:
 *   - Location selection state (URL-synced via ?location= in page mode only)
 *   - Role filter state (URL-synced via ?role= in page mode only)
 *   - Time axis state (local inside AvailabilityGrid, not persisted to URL)
 *
 * Data privacy: all data comes from getRoleAvailability only.
 * No person names, project names, CC names, or PL names are rendered here.
 *
 * Layout: (ModuleHeader page-only) → AvailabilityScopeBar → AvailabilityKPIs →
 *         AvailabilityGrid → side-panel-content
 *
 * Side panel rendering depends on mode (spec §13.9):
 *   - page:      shared 280px SidePanel via useSidePanel() (existing behavior).
 *   - slideover: nested inline below the grid (no panel-within-panel) — the
 *                wide slide-over has no room for a second side panel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { useConfig } from '@/contexts/ConfigContext';
import { capacityApi } from '@/api/endpoints';
import { addMonths } from '@/modules/capacity/timeline/timeAxis';
import { AvailabilityScopeBar } from './availability/AvailabilityScopeBar';
import { AvailabilityKPIs } from './availability/AvailabilityKPIs';
import { AvailabilityGrid } from './availability/AvailabilityGrid';
import { AvailabilitySidePanel } from './availability/AvailabilitySidePanel';
import type { LocationOption, RoleTypeOption } from './availability/AvailabilityScopeBar';
import type { RoleData, SelectedRole } from './availability/types';
import type {
  RoleAvailabilityRow,
  LocationAvailabilitySummary,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_MONTHS = 12;

function getWindowBounds(currentPeriod: string): { start: string; end: string } {
  return {
    start: currentPeriod,
    end: addMonths(currentPeriod, WINDOW_MONTHS - 1),
  };
}

// ---------------------------------------------------------------------------
// Data transformation helpers
// ---------------------------------------------------------------------------

/**
 * Group API rows by role_type_id and build RoleData objects.
 *
 * When a location filter is active, the API already scopes rows to that
 * location — one row per (role, month).
 *
 * When "All locations" is selected, multiple rows may exist per (role, month)
 * — one per location. We merge them: hours sum, competing_demand_count peaks.
 */
function buildRoleData(
  items: RoleAvailabilityRow[],
  selectedLocationId: string | null,
): RoleData[] {
  // Phase 1: group items by role_type_id → month → merge across locations
  const roleMap = new Map<
    string,
    {
      role_type_name: string;
      // month → merged totals
      monthTotals: Map<
        string,
        {
          standard_hours: number;
          allocated_hours: number;
          available_hours: number;
          competing_demand_count: number;
          location_id: string;
          location_name: string;
        }
      >;
      // Track headcount per (role, location) to avoid double-counting months
      headcountByLoc: Map<string, number>;
    }
  >();

  for (const row of items) {
    if (!roleMap.has(row.role_type_id)) {
      roleMap.set(row.role_type_id, {
        role_type_name: row.role_type_name,
        monthTotals: new Map(),
        headcountByLoc: new Map(),
      });
    }
    const entry = roleMap.get(row.role_type_id)!;

    // Track headcount per location (same for all months of that location)
    if (!entry.headcountByLoc.has(row.location_id)) {
      entry.headcountByLoc.set(row.location_id, row.headcount);
    }

    // Merge month data across locations
    const existing = entry.monthTotals.get(row.month);
    if (existing) {
      existing.standard_hours += row.standard_hours;
      existing.allocated_hours += row.allocated_hours;
      existing.available_hours += row.available_hours;
      existing.competing_demand_count = Math.max(
        existing.competing_demand_count,
        row.competing_demand_count,
      );
    } else {
      entry.monthTotals.set(row.month, {
        standard_hours: row.standard_hours,
        allocated_hours: row.allocated_hours,
        available_hours: row.available_hours,
        competing_demand_count: row.competing_demand_count,
        location_id: row.location_id,
        location_name: row.location_name,
      });
    }
  }

  // Phase 2: build RoleData[]
  const result: RoleData[] = [];
  for (const [role_type_id, entry] of roleMap.entries()) {
    // Headcount = sum across distinct locations for this role
    const headcount = Array.from(entry.headcountByLoc.values()).reduce(
      (s, n) => s + n,
      0,
    );

    const monthData: Record<string, RoleAvailabilityRow> = {};
    for (const [month, totals] of entry.monthTotals.entries()) {
      const std = totals.standard_hours;
      const util =
        std > 0
          ? Math.round((totals.allocated_hours / std) * 100 * 10) / 10
          : 0;
      monthData[month] = {
        role_type_id,
        role_type_name: entry.role_type_name,
        location_id: totals.location_id,
        location_name: totals.location_name,
        month,
        headcount,
        standard_hours: std,
        allocated_hours: totals.allocated_hours,
        available_hours: totals.available_hours,
        utilization_pct: util,
        competing_demand_count: totals.competing_demand_count,
      };
    }

    result.push({
      role_type_id,
      role_type_name: entry.role_type_name,
      headcount,
      monthData,
    });
  }

  result.sort((a, b) => a.role_type_name.localeCompare(b.role_type_name));
  return result;
}

/**
 * Derive distinct location options from API rows (headcount > 0 only).
 * Each location's headcount is the sum of per-role headcounts at that location.
 * We use a single headcount value per (role, location) combination to avoid
 * double-counting across months.
 */
function extractLocations(items: RoleAvailabilityRow[]): LocationOption[] {
  // key: location_id → { name, seen role+loc combos }
  const locMap = new Map<string, { name: string; roleLocSeen: Set<string>; headcount: number }>();
  for (const row of items) {
    if (!locMap.has(row.location_id)) {
      locMap.set(row.location_id, {
        name: row.location_name,
        roleLocSeen: new Set(),
        headcount: 0,
      });
    }
    const entry = locMap.get(row.location_id)!;
    const key = `${row.role_type_id}`;
    if (!entry.roleLocSeen.has(key)) {
      entry.roleLocSeen.add(key);
      entry.headcount += row.headcount;
    }
  }
  return Array.from(locMap.entries())
    .map(([id, v]) => ({ id, name: v.name, headcount: v.headcount }))
    .filter((l) => l.headcount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Derive distinct role type options from API rows.
 */
function extractRoleTypes(items: RoleAvailabilityRow[]): RoleTypeOption[] {
  const seen = new Map<string, string>();
  for (const row of items) {
    if (!seen.has(row.role_type_id)) {
      seen.set(row.role_type_id, row.role_type_name);
    }
  }
  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PLAvailabilityViewProps {
  /**
   * `'page'` (default): renders inside a route, with ModuleHeader, URL-synced
   * filters, and a separate 280px shared SidePanel for the role detail.
   *
   * `'slideover'`: renders inside the WideSlideOver. Skips ModuleHeader and
   * URL sync, and nests the AvailabilitySidePanel inline beneath the grid
   * (spec §13.9 — "the side panel nests inside the slide-over as a
   * collapsible section rather than a separate panel-within-panel").
   */
  mode?: 'page' | 'slideover';
  /**
   * Pre-selected location for slide-over mode. Ignored in page mode (URL
   * is the source of truth there).
   */
  initialLocationId?: string | null;
  /**
   * Pre-selected role types for slide-over mode. Ignored in page mode.
   */
  initialRoleIds?: string[];
  /**
   * Slide-over mode only — invoked when the PL clicks "Request this role".
   * The wrapper (PLAvailabilitySlideOver) is responsible for closing the
   * slide-over and propagating the request to the host (e.g. ForecastTab).
   */
  onRequestRole?: (slot: RequestedRoleSlot) => void;
}

export interface RequestedRoleSlot {
  role_type_id: string;
  role_type_name: string;
  /** Selected location (or `null` if "All locations" is active). */
  location_id: string | null;
  location_name: string | null;
  /**
   * Suggested period derived from where availability is highest.
   * Always non-empty when months are available; otherwise undefined.
   */
  suggested_month?: string;
}

export default function PLAvailabilityView({
  mode = 'page',
  initialLocationId = null,
  initialRoleIds = [],
  onRequestRole,
}: PLAvailabilityViewProps = {}) {
  const isSlideOver = mode === 'slideover';
  const { currentPeriod } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openPanel, closePanel } = useSidePanel();

  // URL-synced filter state — initialized from query params (page mode)
  // or from props (slide-over mode).
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    () => (isSlideOver ? initialLocationId : (searchParams.get('location') ?? null)),
  );
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() => {
    if (isSlideOver) return initialRoleIds;
    const raw = searchParams.get('role');
    return raw ? raw.split(',').filter(Boolean) : [];
  });

  // Slide-over mode keeps the selected role in local state so the inline
  // AvailabilitySidePanel can render directly beneath the grid (no panel
  // -within-panel). Page mode keeps using the shared 280px SidePanel.
  const [inlineSelectedRole, setInlineSelectedRole] = useState<SelectedRole | null>(
    null,
  );

  // API data state
  const [items, setItems] = useState<RoleAvailabilityRow[]>([]);
  const [locationSummary, setLocationSummary] = useState<
    LocationAvailabilitySummary[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync filters → URL (replace, not push). Page mode only — slide-over
  // mode is ephemeral and shouldn't pollute the host route's URL.
  useEffect(() => {
    if (isSlideOver) return;
    const next = new URLSearchParams(searchParams);
    if (selectedLocationId) {
      next.set('location', selectedLocationId);
    } else {
      next.delete('location');
    }
    if (selectedRoleIds.length > 0) {
      next.set('role', selectedRoleIds.join(','));
    } else {
      next.delete('role');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // searchParams excluded intentionally to avoid write → re-read loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId, selectedRoleIds, isSlideOver]);

  // Fetch on location filter change (role filter is applied client-side for instant response)
  useEffect(() => {
    const { start, end } = getWindowBounds(currentPeriod);
    const params: {
      month_from?: string;
      month_to?: string;
      location_id?: string;
      role_type_id?: string;
    } = {
      month_from: start,
      month_to: end,
    };
    if (selectedLocationId) {
      params.location_id = selectedLocationId;
    }
    // Don't send role filter to API — apply client-side so role types remain
    // visible in the dropdown even when filtered

    setLoading(true);
    setError(null);
    capacityApi
      .getRoleAvailability(params)
      .then((res) => {
        setItems(res.items);
        setLocationSummary(res.location_summary ?? null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? 'Failed to load availability data.');
        setLoading(false);
      });
  // selectedRoleIds intentionally NOT read inside the effect — we apply
  // the role filter client-side, so role changes don't refetch.
  }, [selectedLocationId, currentPeriod]);

  // Derived data
  const allLocations = useMemo(() => extractLocations(items), [items]);
  const allRoleTypes = useMemo(() => extractRoleTypes(items), [items]);
  const roleData = useMemo(
    () => buildRoleData(items, selectedLocationId),
    [items, selectedLocationId],
  );

  // Client-side role filter
  const filteredRoles = useMemo<RoleData[]>(() => {
    if (selectedRoleIds.length === 0) return roleData;
    return roleData.filter((r) => selectedRoleIds.includes(r.role_type_id));
  }, [roleData, selectedRoleIds]);

  // Location name for side panel header
  const selectedLocationName = useMemo<string | null>(() => {
    if (!selectedLocationId) return null;
    return allLocations.find((l) => l.id === selectedLocationId)?.name ?? null;
  }, [selectedLocationId, allLocations]);

  /**
   * Build the slot payload for the host (e.g. ForecastTab) based on the
   * currently-selected role + location. Picks the month with the highest
   * available_hours as the suggested period (spec §13.7).
   */
  const buildRequestSlot = useCallback(
    (selected: SelectedRole): RequestedRoleSlot => {
      let suggested: string | undefined;
      if (selected.months.length > 0) {
        const best = selected.months.reduce((best, row) =>
          row.available_hours > best.available_hours ? row : best,
        );
        suggested = best.month;
      }
      return {
        role_type_id: selected.role_type_id,
        role_type_name: selected.role_type_name,
        location_id: selectedLocationId,
        location_name: selectedLocationName,
        suggested_month: suggested,
      };
    },
    [selectedLocationId, selectedLocationName],
  );

  // ---------------------------------------------------------------------------
  // Side-panel / role-click handler — branches on mode (§13.9)
  // ---------------------------------------------------------------------------

  function handleRoleClick(selected: SelectedRole) {
    if (isSlideOver) {
      // Inline rendering inside the wide slide-over (no panel-within-panel).
      setInlineSelectedRole(selected);
      return;
    }
    openPanel(
      selected.role_type_name,
      <AvailabilitySidePanel
        role={selected}
        selectedLocationId={selectedLocationId}
        selectedLocationName={selectedLocationName}
        onSelectLocation={(locId) => {
          setSelectedLocationId(locId);
          closePanel();
        }}
      />,
      { width: 280 },
    );
  }

  function handleLocationChange(locationId: string | null) {
    setSelectedLocationId(locationId);
    if (isSlideOver) {
      // Data context shifted — clear the inline detail too.
      setInlineSelectedRole(null);
    } else {
      closePanel(); // close panel when location changes — data context shifts
    }
  }

  function handleInlineRequest() {
    if (!inlineSelectedRole || !onRequestRole) return;
    onRequestRole(buildRequestSlot(inlineSelectedRole));
  }

  // Outer wrapper styling differs slightly between modes — page mode uses
  // p-6 (route-level breathing room); slide-over mode uses p-5 + uses the
  // wide-slide-over's own scroll container.
  const wrapperClass = isSlideOver ? 'space-y-5 p-5' : 'space-y-5 p-6';

  return (
    <div className={wrapperClass}>
      {!isSlideOver && (
        <ModuleHeader
          title="Resource Availability"
          subtitle="Browse role-level capacity to plan your resource requests"
        />
      )}

      {/* Scope controls (§13.3) */}
      <AvailabilityScopeBar
        locations={allLocations}
        roleTypes={allRoleTypes}
        selectedLocationId={selectedLocationId}
        selectedRoleIds={selectedRoleIds}
        onLocationChange={handleLocationChange}
        onRoleFilterChange={setSelectedRoleIds}
      />

      {/* KPI cards (§13.4) */}
      <AvailabilityKPIs roles={filteredRoles} />

      {/* Availability grid (§13.5) */}
      {loading ? (
        <div className="flex items-center justify-center h-40 border border-border rounded-lg bg-card">
          <span className="text-sm text-muted-foreground">
            Loading availability data...
          </span>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-40 border border-border rounded-lg bg-card">
          <span className="text-sm text-destructive">{error}</span>
        </div>
      ) : filteredRoles.length === 0 ? (
        <div className="border border-border rounded-lg bg-card">
          <EmptyState
            icon={CalendarRange}
            title="No availability data"
            description="No roles match the current filters, or no capacity data is available for the selected period."
          />
        </div>
      ) : (
        <AvailabilityGrid
          roles={filteredRoles}
          locationSummary={locationSummary}
          onRoleClick={handleRoleClick}
        />
      )}

      {/* Slide-over inline side panel (§13.9 — nests inside the wide
          slide-over rather than opening a separate panel-within-panel). */}
      {isSlideOver && inlineSelectedRole && (
        <section className="rounded-lg border border-border bg-card p-4">
          <AvailabilitySidePanel
            role={inlineSelectedRole}
            selectedLocationId={selectedLocationId}
            selectedLocationName={selectedLocationName}
            onSelectLocation={(locId) => {
              setSelectedLocationId(locId);
              setInlineSelectedRole(null);
            }}
            onRequestRole={onRequestRole ? handleInlineRequest : undefined}
            requestHelperText={
              onRequestRole
                ? 'Closes the panel and pre-fills the Forecast & Planning row'
                : undefined
            }
          />
        </section>
      )}
    </div>
  );
}
