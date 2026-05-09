/**
 * projectFilters — v5.2 W5 Track B (spec §10.10).
 *
 * Pure predicates and counters for the **project** filter-chip semantics.
 * These mirror the server-side `filter_chip` parameter implemented in
 * `backend/services/capacity_projects.py::_apply_filter_chip` so that
 * frontend chip badges and the rendered list always agree on the count.
 *
 * Per spec §10.10, when `groupBy === 'project'` the chip semantics are:
 *
 *   | Chip              | Predicate (per project)                                         |
 *   |-------------------|------------------------------------------------------------------|
 *   | all               | always true                                                       |
 *   | over_allocated    | any assigned person had any month with total_utilization > 100%  |
 *   | under_utilized    | fulfillment_pct < 50                                              |
 *   | pending_requests  | unfulfilled_slots.length > 0                                       |
 *   | unassigned_months | same as pending_requests (merged in spec §10.10 "may be hidden")  |
 *   | needs_staffing    | fulfillment_pct < 100                                             |
 *
 * The helpers are independent of React so they can be unit-tested in
 * isolation and reused by the chip-bar count overlay in CapacityWorkspace.
 */
import type { CapacityProjectItem } from '@/types/api';
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';

/**
 * True when at least one assigned person on the project has any month
 * with `total_utilization_pct > 100` in the visible window.
 */
export function projectHasOverAllocation(item: CapacityProjectItem): boolean {
  for (const person of item.assigned_people) {
    for (const m of person.monthly) {
      if (m.total_utilization_pct > 100) return true;
    }
  }
  return false;
}

export function projectMatchesChip(
  item: CapacityProjectItem,
  chip: FilterChipKey,
): boolean {
  switch (chip) {
    case 'all':
      return true;
    case 'over_allocated':
      return projectHasOverAllocation(item);
    case 'under_utilized':
      return item.fulfillment_pct < 50;
    case 'pending_requests':
    case 'unassigned_months':
      // spec §10.10: unassigned_months merges into pending_requests
      // because every project with pending RRs has unassigned months.
      return item.unfulfilled_slots.length > 0;
    case 'needs_staffing':
      return item.fulfillment_pct < 100;
    default:
      // Unknown key — pass through (matches role-view convention).
      return true;
  }
}

/** Apply the active filter chip set with AND combinator. */
export function filterProjects(
  items: readonly CapacityProjectItem[],
  activeFilters: readonly FilterChipKey[],
): CapacityProjectItem[] {
  if (activeFilters.length === 0 || activeFilters.includes('all')) {
    return items.slice();
  }
  return items.filter((it) =>
    activeFilters.every((chip) => projectMatchesChip(it, chip)),
  );
}

/** Number of items that would match a single chip if it were active alone. */
export function countProjectsMatching(
  items: readonly CapacityProjectItem[],
  chip: FilterChipKey,
): number {
  if (chip === 'all') return items.length;
  let count = 0;
  for (const it of items) {
    if (projectMatchesChip(it, chip)) count++;
  }
  return count;
}
