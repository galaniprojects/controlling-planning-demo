/**
 * PLAvailabilityView — v5.2 W4 Track C (spec §13)
 *
 * Project Lead read-only capacity view. Route: /capacity/availability
 * Access: PL only. Non-PL roles are redirected to /capacity by CapacityManagement.
 *
 * Self-contained page — no dependency on CapacityScopeContext. Owns its own:
 *   - Location selection state (URL-synced via ?location=)
 *   - Role filter state (URL-synced via ?role=)
 *   - Time axis state (local inside AvailabilityGrid, not persisted to URL)
 *
 * Data privacy: all data comes from getRoleAvailability only.
 * No person names, project names, CC names, or PL names are rendered here.
 *
 * Layout: ModuleHeader → AvailabilityScopeBar → AvailabilityKPIs →
 *         AvailabilityGrid → (shared SidePanel for AvailabilitySidePanel)
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useSidePanel } from '@/contexts/SidePanelContext';
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

const DEMO_MONTH = '2026-04';
const WINDOW_MONTHS = 12;

function getWindowBounds(): { start: string; end: string } {
  return {
    start: DEMO_MONTH,
    end: addMonths(DEMO_MONTH, WINDOW_MONTHS - 1),
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

export default function PLAvailabilityView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openPanel, closePanel } = useSidePanel();

  // URL-synced filter state — initialized from query params
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    () => searchParams.get('location') ?? null,
  );
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(() => {
    const raw = searchParams.get('role');
    return raw ? raw.split(',').filter(Boolean) : [];
  });

  // API data state
  const [items, setItems] = useState<RoleAvailabilityRow[]>([]);
  const [locationSummary, setLocationSummary] = useState<
    LocationAvailabilitySummary[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync filters → URL (replace, not push)
  useEffect(() => {
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
  }, [selectedLocationId, selectedRoleIds]);

  // Fetch on location filter change (role filter is applied client-side for instant response)
  useEffect(() => {
    const { start, end } = getWindowBounds();
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
  // selectedRoleIds intentionally excluded — we apply role filter client-side
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

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

  // Side panel handler — opens AvailabilitySidePanel via shared useSidePanel()
  function handleRoleClick(selected: SelectedRole) {
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
    closePanel(); // close panel when location changes — data context shifts
  }

  return (
    <div className="space-y-5 p-6">
      <ModuleHeader
        title="Resource Availability"
        subtitle="Browse role-level capacity to plan your resource requests"
      />

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
    </div>
  );
}
