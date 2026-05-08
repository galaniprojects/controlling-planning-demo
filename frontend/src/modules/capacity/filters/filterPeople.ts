/**
 * filterPeople — v5.2 W3 Track B (§6.2).
 *
 * Pure utility that applies the active filter chips (`FilterChipKey[]`)
 * from `CapacityScopeContext` to a list of timeline rows and returns
 * the filtered subset. Track A's TimelineView consumes this same
 * function so KPI counts, chip badge counts, and the rendered timeline
 * all agree on the meaning of each chip.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §6 (filter chips).
 *
 * Filter logic (per §6.1):
 *   - `all`               → return all rows.
 *   - `over_allocated`    → max(utilization) > 100% in any visible month.
 *   - `under_utilized`    → avg(utilization) < `UNDER_UTILIZED_THRESHOLD`
 *                           across visible months (40% default — see
 *                           planning parameter `capacity.under_utilized_threshold`).
 *   - `pending_requests`  → has at least one pending RR targeting them.
 *   - `unassigned_months` → has a pending RR with at least one un-assigned
 *                           month cell.
 *
 * Mutual-exclusivity (`all` vs specifics) is enforced by
 * `normalizeActiveFilters` in CapacityScopeContext; this function
 * accepts whatever the context publishes and treats unknown keys as
 * pass-through.
 *
 * The `TimelineRow` shape is intentionally narrow — it captures only
 * the fields needed to evaluate the predicates so Track A can produce
 * rows from any data source (heatmap response, mocked data, etc.)
 * without coupling to a particular API shape.
 */
import type { FilterChipKey } from '@/contexts/CapacityScopeContext';

/** Under-utilized chip threshold (§6.1). Spec calls this configurable
 *  via planning parameters; for v5.2 W3 we hard-code the default. */
export const UNDER_UTILIZED_THRESHOLD = 40;

/**
 * Loose row shape consumed by `filterPeople` and the chip-badge counts.
 *
 * Track A produces these rows from `getTeamHeatmap` / `getOrgHeatmap`
 * + the resource-request inbox; only the fields below are required to
 * evaluate the filter predicates.
 */
export interface TimelineRow {
  /** Stable person identifier — used for de-duplication when needed. */
  person_id: string;
  /** Per-month utilization percentages (0–N) within the visible window. */
  monthly_utilization: number[];
  /** True when this person is the `assigned_person_id` on any pending RR. */
  has_pending_request: boolean;
  /**
   * True when this person is linked to an RR whose monthly assignment
   * has at least one un-assigned month cell.
   */
  has_unassigned_months: boolean;
}

function maxOrZero(values: number[]): number {
  if (values.length === 0) return 0;
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

function avgOrZero(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Predicate for a single chip + row. Exported for chip-badge counts. */
export function rowMatchesFilter(
  row: TimelineRow,
  filter: FilterChipKey,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'over_allocated':
      return maxOrZero(row.monthly_utilization) > 100;
    case 'under_utilized':
      return avgOrZero(row.monthly_utilization) < UNDER_UTILIZED_THRESHOLD;
    case 'pending_requests':
      return row.has_pending_request;
    case 'unassigned_months':
      return row.has_unassigned_months;
    default:
      // Unknown filter key — pass through rather than silently hiding
      // every row. Should never happen with the context normalizer.
      return true;
  }
}

/**
 * Filter a list of timeline rows by the currently-active filter chips.
 *
 * - `['all']` (or empty) returns the input unchanged.
 * - Multiple specific chips combine with **AND** (a row must match
 *   every active chip to be included).
 */
export function filterPeople(
  rows: readonly TimelineRow[],
  activeFilters: readonly FilterChipKey[],
): TimelineRow[] {
  if (activeFilters.length === 0 || activeFilters.includes('all')) {
    return rows.slice();
  }
  return rows.filter((row) =>
    activeFilters.every((filter) => rowMatchesFilter(row, filter)),
  );
}

/**
 * Count helper for the FilterChipBar badge — returns the number of
 * rows that *would* match a single chip if it were the only active
 * filter. Used to render the `(N)` count next to each chip label
 * regardless of whether that chip is currently active (§6.1).
 */
export function countMatching(
  rows: readonly TimelineRow[],
  filter: FilterChipKey,
): number {
  if (filter === 'all') return rows.length;
  let count = 0;
  for (const row of rows) {
    if (rowMatchesFilter(row, filter)) count++;
  }
  return count;
}
