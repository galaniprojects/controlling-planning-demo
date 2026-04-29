/**
 * TypeScript types mirroring backend/schemas/milestones.py [A-MS-01..03] [A-BK-34].
 */

export interface MilestoneTypeResponse {
  id: string;
  name: string;
  default_color: string;
  suggested_ordering: number;
  is_active: boolean;
}

export interface MilestoneResponse {
  id: number;
  project_id: string;
  sequence_number: number;
  name: string;
  milestone_type_id: string | null;
  baseline_start: string;
  baseline_end: string;
  forecast_start: string;
  forecast_end: string;
  /** Resolved colour — own override when set, else MilestoneType.default_color. */
  color: string | null;
  /** Baseline-end vs forecast-end month delta. */
  slip_months: number;
  baseline_locked_at: string | null;
}

export interface MilestoneListResponse {
  items: MilestoneResponse[];
  total: number;
}
