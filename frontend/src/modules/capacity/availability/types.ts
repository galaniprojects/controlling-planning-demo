/**
 * Shared types for the PL Availability view (v5.2 W4 Track C — spec §13).
 *
 * These are internal view-layer types derived from the API shape; they do NOT
 * duplicate backend schema — they organize the API data for component rendering.
 */
import type { RoleAvailabilityRow, LocationAvailabilitySummary } from '@/types/api';

/**
 * Aggregated data for one role type across all visible time columns.
 * Passed from AvailabilityGrid into RoleAvailabilityRow and AvailabilitySidePanel.
 */
export interface RoleData {
  role_type_id: string;
  role_type_name: string;
  /** Headcount at the selected location (or total across all locations). */
  headcount: number;
  /** Per-month data keyed by "YYYY-MM". All API rows for this role. */
  monthData: Record<string, RoleAvailabilityRow>;
}

/**
 * The selection that opens the side panel — identifies which role row was clicked.
 */
export interface SelectedRole {
  role_type_id: string;
  role_type_name: string;
  headcount: number;
  /** Per-month data ordered by month string. */
  months: RoleAvailabilityRow[];
  /** Location comparison rows (only when "All locations" is selected). */
  locationSummary?: LocationAvailabilitySummary[] | null;
}
