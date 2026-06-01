/**
 * TypeScript types for the Define-page redesign.
 *
 * Mirrors backend/schemas/projects_define.py:
 *   - ProjectDefineResponse  → ProjectDefineResponse
 *   - ProjectDefineCreate    → ProjectDefineCreate
 *   - ProjectIdentityUpdate  → ProjectIdentityUpdate
 *   - ProjectApprovalMilestonesUpdate → ProjectApprovalMilestonesUpdate
 *   - ProjectFinancialsUpdate → ProjectFinancialsUpdate / BaselineGridRow
 *
 * One canonical response shape (`ProjectDefineResponse`) is shared by all
 * four endpoints: POST /api/projects/define, GET /api/projects/{id}/define,
 * PUT /api/projects/{id}/identity, PUT /api/projects/{id}/approval-milestones.
 */

export type CapexOpex = 'capex' | 'opex';
export type TshirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type TransformationLevel = 'T0' | 'T1' | 'T2';

export interface ProjectDefineResponse {
  id: string;
  name: string;
  description: string | null;
  review_state: string | null;
  capex_opex: CapexOpex;
  start_month: string;          // YYYY-MM
  end_month: string | null;
  pl_person_id: string | null;
  is_service: boolean;
  project_type: number | null;  // 1 | 2 | 3 (nullable on the model)
  transformation_level: TransformationLevel | null;
  total_budget: number | null;
  tshirt_size: TshirtSize | null;
  complexity_score: number | null;
  value_creation_score: number | null;
  composite_score: number | null;
  pipeline_stage: string | null;
  doi: number | null;
  frozen_doi: number | null;
  ai_council_approved: boolean;
  ai_council_doc_url: string | null;
  rag_status: string | null;
  lob_id: string | null;
  // Reserved alias fields (no separate columns yet — server echoes null).
  problem_statement: string | null;
  business_driver: string | null;
  expected_outcome: string | null;
}

export interface ProjectDefineCreate {
  name: string;
  description?: string | null;
  lob_id?: string | null;
  pl_person_id?: string | null;
}

export interface ProjectIdentityUpdate {
  name?: string;
  description?: string | null;
  project_type?: number | null;
  capex_opex?: CapexOpex;
  lob_id?: string | null;
  pl_person_id?: string | null;
  start_month?: string;
  end_month?: string | null;
  is_service?: boolean;
}

export interface ProjectApprovalMilestonesUpdate {
  ai_council_approved?: boolean;
  ai_council_doc_url?: string | null;
  /**
   * Transformation level lives on the Tech Navigator tab; included here
   * for backend completeness but the Approval & Milestones tab UI should
   * not surface it. Kept optional / unused by the tab.
   */
  transformation_level?: TransformationLevel | null;
  advance_to_doi?: number | null;
  override_reason?: string | null;
}

/** Per-row baseline payload — Financials tab grid persistence. */
export interface BaselineGridRow {
  category: 'internal' | 'external';
  sub_category: string;
  months: Array<{ month: string; amount_eur: number; hours?: number | null }>;
  capex_opex?: CapexOpex;
  description?: string | null;
  vendor?: string | null;
  role_type_id?: string | null;
}

export interface ProjectFinancialsUpdate {
  total_budget?: number | null;
  capex_opex?: CapexOpex;
  rows?: BaselineGridRow[];
}

export interface BaselineGridResponseRow extends BaselineGridRow {
  /** Resolved display name (role label or external cost-type label). */
  sub_category_name?: string | null;
}

export interface BaselineGridResponse {
  items: BaselineGridResponseRow[];
  total: number;
}

export interface ProjectFinancialsSaveResponse {
  project: ProjectDefineResponse;
  baseline_rows: BaselineGridResponse;
}
