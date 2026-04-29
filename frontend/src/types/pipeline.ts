/**
 * Pipeline / DoI / intake types — mirrors backend
 * `schemas/pipeline.py` and `schemas/intake.py`.
 */

export interface PipelineGateStatus {
  current_doi: number | null;
  next_doi: number | null;
  missing_fields: string[];
  can_advance: boolean;
  override_available: boolean;
}

export interface PipelineState {
  project_id: string;
  pipeline_stage: string | null;
  doi: number | null;
  frozen_doi: number | null;
  ai_council_approved: boolean;
  ai_council_doc_url: string | null;
  within_cutoff: boolean | null;
  transitions_available: string[];
  gate_status: PipelineGateStatus;
}

export interface StageTransitionRequest {
  target_stage: string;
  target_doi?: number | null;
  override_reason?: string | null;
}

export interface IntakeProjectCreate {
  name: string;
  description: string;
  lob_id: string;
  project_type: 1 | 2 | 3;
  capex_opex?: 'capex' | 'opex';
  start_month: string; // YYYY-MM
  end_month?: string | null;
  pl_person_id?: string | null;
  is_service?: boolean;
}

export interface IntakeProjectResponse {
  id: string;
  name: string;
  pipeline_stage: string;
  doi: number;
  status: string;
  pl_person_id: string | null;
  project_type: number;
  composite_score: number | null;
  total_budget: number | null;
}
