/**
 * Progress tracker types — frontend mirror of `backend/schemas/workbench.py`
 * progress models per `[E-04c]` `[E-05a]`.
 *
 * The progress tracker is milestone-anchored qualitative progress with three
 * core fields (intra-milestone %, status narrative, next-milestone
 * confidence) plus an optional deliverable checklist (max 10 items per
 * milestone). Snapshots are captured at every forecast cycle submission.
 */

export type ProgressConfidence = 'on_track' | 'at_risk' | 'blocked';

export interface DeliverableItem {
  id: number;
  milestone_id: number;
  sequence: number;
  text: string;
  is_complete: boolean;
  completed_at: string | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
}

export interface DeliverableListResponse {
  items: DeliverableItem[];
  total: number;
}

export interface CurrentMilestoneSummary {
  id: number;
  sequence_number: number;
  name: string;
  baseline_start: string;
  baseline_end: string;
  forecast_start: string;
  forecast_end: string;
}

export interface ChecklistRollup {
  total_items: number;
  completed_items: number;
  /** Null when total_items === 0 */
  completion_pct: number | null;
}

export interface ProgressResponse {
  project_id: string;
  project_name: string;
  current_milestone: CurrentMilestoneSummary | null;
  /** Stored manual percentage (may be null when no progress reported yet). */
  progress_pct: number | null;
  /**
   * Effective percentage — auto-derived from the checklist when items exist
   * AND ``progress_pct_manual_override`` is false; otherwise mirrors the
   * stored ``progress_pct``.
   */
  effective_progress_pct: number | null;
  progress_pct_manual_override: boolean;
  status_narrative: string | null;
  next_milestone_confidence: ProgressConfidence | null;
  confidence_reason: string | null;
  progress_updated_at: string | null;
  progress_updated_by_id: string | null;
  progress_updated_by_name: string | null;
  checklist: ChecklistRollup;
  deliverables: DeliverableItem[];
}

export interface ProgressUpdateRequest {
  current_milestone_id?: number | null;
  progress_pct?: number | null;
  progress_pct_manual_override?: boolean | null;
  status_narrative?: string | null;
  next_milestone_confidence?: ProgressConfidence | null;
  confidence_reason?: string | null;
}

export interface ProgressSnapshotMeta {
  id: number;
  project_id: string;
  cycle_label: string | null;
  cycle_id: string | null;
  snapshot_at: string;
  created_by_id: string | null;
  created_by_name: string | null;
  current_milestone_id: number | null;
  current_milestone_name: string | null;
  current_milestone_sequence: number | null;
  progress_pct: number | null;
  progress_pct_manual_override: boolean;
  status_narrative: string | null;
  next_milestone_confidence: ProgressConfidence | null;
  confidence_reason: string | null;
}

export interface ProgressHistoryListResponse {
  items: ProgressSnapshotMeta[];
  total: number;
}

export interface ProgressSnapshotChecklistEntry {
  milestone_id: number;
  milestone_name: string;
  sequence_number: number;
  items: Array<{
    text: string;
    is_complete: boolean;
    sequence: number;
  }>;
}

export interface ProgressSnapshotDetail {
  meta: ProgressSnapshotMeta;
  checklist: ProgressSnapshotChecklistEntry[];
}
