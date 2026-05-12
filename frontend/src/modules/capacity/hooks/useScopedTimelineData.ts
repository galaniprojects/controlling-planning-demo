/**
 * useScopedTimelineData — v5.2 W3 Track A.
 *
 * Resolves the current `CapacityScope` + `groupBy` into a normalized
 * timeline dataset (role groups + person rows + project-name lookup),
 * fetching from the existing W1 endpoints and merging per-person
 * project breakdowns from `getPersonDetail`.
 *
 * Strategy:
 *   - **`my_cc` scope** (CC-Owner default, or Controller's picked CC):
 *       1. Fetch `getTeamHeatmap(ccId)` → role rows + person utilization
 *          cells with hours/std-hours per month.
 *       2. Fetch `getPersonDetail(ccId, person.id)` for each person in
 *          parallel → per-month project allocations.
 *       3. Merge into `RoleGroupData[]` (or a flat `PersonRowData[]`
 *          for `groupBy === 'person'`).
 *   - **All other scopes** (`all_ccs`, `location`, `hierarchy`):
 *       Returns `{ rows: [], months: [], reason: 'org-scope-not-yet-supported' }`.
 *       Track A consumers render an explanatory empty state. Org-level
 *       person-resolved timeline rows would require a new bulk endpoint
 *       which is out of W3 scope; the dashboard layer (S7) covers org
 *       scope visually.
 *   - **`groupBy === 'project'`**: also returns empty with reason
 *     `'project-view-pending'` — that's W5 territory per the team-lead
 *     handoff.
 *
 * Spec refs: §3 (timeline rows), §3.6 (sorting), §4.5 (visible window),
 * §6 (filter chip integration via `applyFilters`).
 */
import { useEffect, useRef, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import type {
  RoleHeatmapRow,
  PersonHeatmapRow,
  PersonDetail,
} from '@/types/api';
import {
  type MonthCell,
  defaultTimeAxisState,
  generateMonthRange,
  addMonths,
  type TimeAxisState,
} from '../timeline/timeAxis';
import { DEMO_DATE } from '@/lib/yearColumns';
import type { PersonRowData } from '../timeline/PersonTimelineRow';
import type { RoleGroupData } from '../timeline/RoleGroup';
import {
  filterPeople as filterPeopleStrict,
  type TimelineRow,
} from '../filters/filterPeople';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';

// ---------------------------------------------------------------------------
// Visible window
// ---------------------------------------------------------------------------

/** Visible window per spec §4.5: from `windowStart` (earliest allocation, but
 *  bounded by demo_date - 12 months) to `demo_date + 23 months`.
 *
 *  The team-heatmap endpoint defaults to `[demo, demo+11]` — for the
 *  Track A timeline we want a wider window so users can scroll to past
 *  allocations and forecasted future months. Earliest allocation is
 *  not exposed by `getTeamHeatmap`, so we fall back to a sensible
 *  default range and let `from_month`/`to_month` query params drive it.
 */
const TIMELINE_WINDOW_START = addMonths(DEMO_DATE, -3);
const TIMELINE_WINDOW_END = addMonths(DEMO_DATE, 23);
const VISIBLE_MONTHS = generateMonthRange(TIMELINE_WINDOW_START, TIMELINE_WINDOW_END);

// ---------------------------------------------------------------------------
// Hook result types
// ---------------------------------------------------------------------------

export type ScopedTimelineUnsupportedReason =
  | 'org-scope-not-yet-supported'
  | 'project-view-pending'
  | 'no-cc-selected';

export interface ScopedTimelineData {
  /** All visible months for the timeline window (passed to buildVisibleColumns). */
  months: string[];
  /** Default time-axis state (used to seed parent state once on first render). */
  defaultState: TimeAxisState;
  /** Role-grouped rows when `groupBy === 'role'`. */
  roleGroups: RoleGroupData[];
  /** Flat person rows when `groupBy === 'person'`. */
  flatPeople: PersonRowData[];
  /** All visible projects across the dataset (for ProjectColorMap registration). */
  visibleProjectIds: string[];
  /** Project-id → name lookup (forwarded into PersonRowData.projectNames). */
  projectNames: Record<string, string>;
  /** Loading flag for the initial fetch + per-person details. */
  isLoading: boolean;
  /** Network/API error message (rendered as an inline error state). */
  error: string | null;
  /**
   * Set when the requested scope/groupBy combination isn't backable by
   * the current endpoint suite. Consumers render an explanatory empty
   * state. Null when the timeline is fully renderable.
   */
  unsupportedReason: ScopedTimelineUnsupportedReason | null;
}

// ---------------------------------------------------------------------------
// Helpers — convert API responses into normalized row data
// ---------------------------------------------------------------------------

function buildCellsByMonth(
  utilization: PersonHeatmapRow['utilization'],
): Record<string, MonthCell> {
  const out: Record<string, MonthCell> = {};
  for (const c of utilization) {
    out[c.month] = {
      month: c.month,
      utilization: c.value,
      allocatedHours: c.allocated_hours ?? 0,
      standardHours: c.standard_hours ?? 0,
      projects: [], // filled in via PersonDetail merge below
    };
  }
  return out;
}

/**
 * Fold a `PersonDetail.allocations_by_month` payload into the
 * pre-built `MonthCell` map. Only the project list is overwritten;
 * the team-heatmap's utilization + std hours stay authoritative.
 */
function mergePersonDetail(
  cellsByMonth: Record<string, MonthCell>,
  detail: PersonDetail,
  projectNames: Record<string, string>,
) {
  for (const m of detail.allocations_by_month) {
    const cell = cellsByMonth[m.month];
    if (!cell) continue;
    cell.projects = m.projects.map((p) => ({
      projectId: p.project_id,
      hours: p.hours,
    }));
    for (const p of m.projects) {
      if (!projectNames[p.project_id]) {
        projectNames[p.project_id] = p.project_name;
      }
    }
  }
}

function peakUtilization(cells: Record<string, MonthCell>): number {
  let max = 0;
  for (const c of Object.values(cells)) {
    if (c.utilization > max) max = c.utilization;
  }
  return max;
}

function lastNameOf(name: string): string {
  // Heuristic — treat last whitespace-delimited token as the last name.
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function sortPersonRows(rows: PersonRowData[]): PersonRowData[] {
  return [...rows].sort((a, b) => {
    if (b.peakUtilization !== a.peakUtilization) {
      return b.peakUtilization - a.peakUtilization;
    }
    return lastNameOf(a.personName).localeCompare(lastNameOf(b.personName));
  });
}

function aggregateRoleCells(
  people: PersonRowData[],
  months: string[],
): Record<string, MonthCell> {
  if (people.length === 0) return {};
  const out: Record<string, MonthCell> = {};
  for (const m of months) {
    let utilSum = 0;
    let stdSum = 0;
    let allocSum = 0;
    let count = 0;
    for (const p of people) {
      const c = p.cellsByMonth[m];
      if (c) {
        utilSum += c.utilization;
        stdSum += c.standardHours;
        allocSum += c.allocatedHours;
        count += 1;
      }
    }
    if (count > 0) {
      out[m] = {
        month: m,
        utilization: utilSum / count,
        standardHours: stdSum,
        allocatedHours: allocSum,
        projects: [],
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filter integration
// ---------------------------------------------------------------------------

/**
 * Convert PersonRowData (for filtering) into the loose TimelineRow
 * shape Track B's `filterPeople` expects. The `has_pending_request` /
 * `has_unassigned_months` flags are best-effort defaults until the
 * inbox / per-request data is plumbed (Track D); the chip behaviour
 * still works for `over_allocated` / `under_utilized` which only need
 * monthly utilization arrays.
 */
function toTimelineRow(p: PersonRowData, months: string[]): TimelineRow {
  return {
    person_id: p.personId,
    monthly_utilization: months.map((m) => p.cellsByMonth[m]?.utilization ?? 0),
    has_pending_request: false,
    has_unassigned_months: false,
  };
}

/**
 * Apply Track B's filter predicates to a list of person rows. Returns
 * the filtered subset preserving input order. Track A calls this from
 * inside `useScopedTimelineData` so role-group counts in the renderer
 * already reflect the filtered set.
 */
function applyActiveFilters(
  rows: PersonRowData[],
  months: string[],
  activeFilters: readonly FilterChipKey[],
): PersonRowData[] {
  if (activeFilters.length === 0 || activeFilters.includes('all')) {
    return rows;
  }
  const proxies = rows.map((r) => toTimelineRow(r, months));
  const allowedIds = new Set(
    filterPeopleStrict(proxies, activeFilters).map((r) => r.person_id),
  );
  return rows.filter((r) => allowedIds.has(r.personId));
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

const EMPTY_RESULT: ScopedTimelineData = {
  months: VISIBLE_MONTHS,
  defaultState: defaultTimeAxisState(VISIBLE_MONTHS, DEMO_DATE),
  roleGroups: [],
  flatPeople: [],
  visibleProjectIds: [],
  projectNames: {},
  isLoading: false,
  error: null,
  unsupportedReason: null,
};

/**
 * Fetches timeline data for the active scope + groupBy. Pass `skip=true`
 * when the caller already has data from another invocation (the timeline
 * accepts a `data` prop from its parent so the workspace shares one
 * fetch between FilterChipBar and the timeline rows).
 */
export function useScopedTimelineData(skip = false): ScopedTimelineData {
  const { scope, ccId, groupBy, activeFilters } = useCapacityScope();
  const [state, setState] = useState<ScopedTimelineData>(EMPTY_RESULT);
  // Sentinel ref so a stale fetch (after the user changes scope) does
  // not overwrite the freshest result.
  const fetchTokenRef = useRef(0);

  useEffect(() => {
    if (skip) return;
    // Guard: project-grouping has its own data feed
    // (`<ProjectGroupView />` calls `capacityApi.getProjects` directly).
    // Return EMPTY_RESULT without a reason so the timeline component
    // routes to ProjectGroupView instead of showing an empty-state card.
    if (groupBy === 'project') {
      setState(EMPTY_RESULT);
      return;
    }

    // Guard: only my_cc scope (with a resolved ccId) is supported in W3.
    if (scope.kind !== 'my_cc') {
      setState({
        ...EMPTY_RESULT,
        unsupportedReason: 'org-scope-not-yet-supported',
      });
      return;
    }
    if (!ccId) {
      setState({
        ...EMPTY_RESULT,
        unsupportedReason: 'no-cc-selected',
      });
      return;
    }

    const token = ++fetchTokenRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const fromMonth = TIMELINE_WINDOW_START;
    const toMonth = TIMELINE_WINDOW_END;

    capacityApi
      .getTeamHeatmap(ccId, fromMonth, toMonth)
      .then(async (res) => {
        if (token !== fetchTokenRef.current) return;
        const roleRows: RoleHeatmapRow[] = res.items;

        // Discover all people across the role rows (excluding synthetic
        // External rows whose ids match `${roleId}__external`).
        const personIdsSeen = new Set<string>();
        for (const r of roleRows) {
          for (const p of r.people) {
            if (p.person_id.includes('__external')) continue;
            personIdsSeen.add(p.person_id);
          }
        }

        // Fetch per-person details in parallel for the project breakdown.
        // For each result, we keep a row even if its detail call fails
        // (the bar still renders; project segments degrade to a neutral
        // fill via SegmentBar's fallback path).
        const personIds = Array.from(personIdsSeen);
        const detailPromises = personIds.map((pid) =>
          capacityApi
            .getPersonDetail(ccId, pid)
            .catch(() => null as PersonDetail | null),
        );
        const details = await Promise.all(detailPromises);
        if (token !== fetchTokenRef.current) return;

        const detailById = new Map<string, PersonDetail | null>();
        personIds.forEach((pid, i) => detailById.set(pid, details[i]));

        // Build PersonRowData rows
        const projectNames: Record<string, string> = {};
        const allPeople: PersonRowData[] = [];
        const peopleByRole = new Map<string, PersonRowData[]>();

        for (const r of roleRows) {
          for (const p of r.people) {
            if (p.person_id.includes('__external')) continue;
            const cellsByMonth = buildCellsByMonth(p.utilization);
            const detail = detailById.get(p.person_id);
            if (detail) mergePersonDetail(cellsByMonth, detail, projectNames);
            const row: PersonRowData = {
              personId: p.person_id,
              personName: p.name,
              roleId: r.role_id,
              roleName: r.role_name,
              cellsByMonth,
              projectNames,
              peakUtilization: peakUtilization(cellsByMonth),
            };
            allPeople.push(row);
            if (!peopleByRole.has(r.role_id)) peopleByRole.set(r.role_id, []);
            peopleByRole.get(r.role_id)!.push(row);
          }
        }

        // Apply filter chips (§6).
        const filtered = applyActiveFilters(allPeople, VISIBLE_MONTHS, activeFilters);
        const filteredIds = new Set(filtered.map((p) => p.personId));

        // Sort + group.
        const roleGroups: RoleGroupData[] = roleRows.map((r) => {
          const peopleAll = peopleByRole.get(r.role_id) ?? [];
          const peopleVisible = peopleAll.filter((p) =>
            filteredIds.has(p.personId),
          );
          const sorted = sortPersonRows(peopleVisible);
          return {
            roleId: r.role_id,
            roleName: r.role_name,
            people: sorted,
            aggregateCellsByMonth: aggregateRoleCells(sorted, VISIBLE_MONTHS),
          };
        }).filter((g) => g.people.length > 0);

        const flatPeople = sortPersonRows(filtered);

        // Visible projects across the (filtered) dataset — used to
        // register colors with ProjectColorMap.
        const visibleProjectIds = Array.from(
          new Set(
            filtered.flatMap((p) =>
              Object.values(p.cellsByMonth).flatMap((c) =>
                c.projects.map((pp) => pp.projectId),
              ),
            ),
          ),
        );

        setState({
          months: VISIBLE_MONTHS,
          defaultState: defaultTimeAxisState(VISIBLE_MONTHS, DEMO_DATE),
          roleGroups,
          flatPeople,
          visibleProjectIds,
          projectNames,
          isLoading: false,
          error: null,
          unsupportedReason: null,
        });
      })
      .catch((err) => {
        if (token !== fetchTokenRef.current) return;
        setState({
          ...EMPTY_RESULT,
          error: err instanceof Error ? err.message : 'Failed to load timeline data',
          isLoading: false,
        });
      });
    // We intentionally re-run on scope.kind / scope.id / ccId / groupBy /
    // activeFilters changes. activeFilters is a fresh array each render
    // from the context but its identity only matters when content
    // changes (the renderer applies the same filter logic so a stale
    // result is corrected on the next render).
    //
    // v5.2 W6 Track B (#8.4) — dependency audit:
    //   - `scope` itself is omitted: only `scope.kind` + `scope.id` are
    //     read inside the effect, so destructuring is safe.
    //   - `activeFilters` is captured by reference inside the closure but
    //     `activeFilters.join(',')` is in the deps, so any content change
    //     re-fires the effect (FilterChipKey values are comma-free).
    //   - Async `.then(...)` chains use the `token` constant captured at
    //     the start; staleness checked via `fetchTokenRef.current` after
    //     each await — guards against scope changes mid-fetch.
    //   - `VISIBLE_MONTHS` / `TIMELINE_WINDOW_*` are module-level
    //     constants — no closure risk.
    //   - `applyActiveFilters` and helpers are pure module fns — safe.
    //   No stale-closure issues found in this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    skip,
    scope.kind,
    scope.id ?? null,
    ccId,
    groupBy,
    // Stringify activeFilters so React only re-fetches on actual change.
    activeFilters.join(','),
  ]);

  return state;
}
