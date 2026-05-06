import type { DetailViewLineItem, DetailViewKPI } from '@/lib/detailViewTypes';

// Response envelope
export interface ListResponse<T> {
  items: T[];
  total: number;
}

// Detail View Grid response shape (used by CR detail, intake detail)
export interface DetailViewGridDataResponse {
  months: string[];
  line_items: DetailViewLineItem[];
  kpis: DetailViewKPI[];
}

// Role types
export interface RoleInfo {
  id: string;
  name: string;
  user_name: string;
  user_title: string | null;
  default_module: string;
}

export interface RoleContext {
  role: string;
  user_name: string;
  user_title: string | null;
  accessible_modules: string[];
  owned_project_ids: string[];
  managed_cost_center_id: string | null;
  /**
   * v5 B2 [B-AC-02] [D-AC-02] — Tier 3 simulator-access flag from
   * User.tier3_flag, looked up by person_id on the backend. Frontend
   * gates Tier 3 surfaces / impact dimensions / catalogue actions on
   * this. Defaults to false when no active User row exists.
   */
  tier3_flag?: boolean;
}

// Notifications
export interface Notification {
  id: number;
  message: string;
  severity: string;
  deep_link_module: string | null;
  deep_link_entity_id: string | null;
  is_read: boolean;
}

// Pending Actions
export interface PendingAction {
  id: string;
  type: string;
  title: string;
  description: string;
  urgency: 'urgent' | 'info';
  deep_link_module: string;
  deep_link_entity_id: string | null;
  deep_link_tab: string | null;
  timestamp: string | null;
}

// KPIs
export interface PortfolioKPISummary {
  total_budget: number;
  ytd_spend: number;
  portfolio_variance_pct: number;
  overall_utilization_pct: number;
  run_change_ratio: string;
}

// Module tiles
export interface ModuleTile {
  id: string;
  name: string;
  description: string;
  contextual_metric: string;
  visible: boolean;
  sort_order: number;
  /** v5.1 W6 [C-01] — 1–2 role-differentiated subtitle KPIs. */
  subtitle_kpis: string[];
}

// --- v5 Session E7 — PL capacity read-only role-availability per [E-06a] ---

export interface RoleAvailabilityRow {
  role_type_id: string;
  role_type_name: string;
  location_id: string;
  location_name: string;
  month: string;
  headcount: number;
  standard_hours: number;
  allocated_hours: number;
  available_hours: number;
  utilization_pct: number;
}

export interface RoleAvailabilityResponse {
  items: RoleAvailabilityRow[];
  total: number;
  months: string[];
}

// Project creation
export interface ResourcePlanItem {
  role_type_id: string;
  hours_per_month: number;
  period_start: string;
  period_end: string;
}

export interface ExternalCostItem {
  cost_type_id: string;
  amount_per_month: number;
  period_start: string;
  period_end: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  lob_id: string;
  start_month: string;
  end_month?: string;
  capex_opex?: string;
  resource_plan?: ResourcePlanItem[];
  external_costs?: ExternalCostItem[];
}

// --- Portfolio Overview ---

export interface PortfolioKPIs {
  baseline: number;
  current_forecast: number;
  ytd_actuals: number;
  plan_drift_amount: number;
  plan_drift_pct: number;
  capex_total: number;
  opex_total: number;
  capex_pct: number;
  opex_pct: number;
  run_total: number;
  change_total: number;
  run_pct: number;
  change_pct: number;
  // Lifetime summary
  lifetime_baseline?: number;
  lifetime_forecast?: number;
  lifetime_actuals?: number;
  active_project_count?: number;
}

export interface TimelineInfo {
  start: string | null;
  end: string | null;
  projected_end: string | null;
}

export interface ProjectTreeNode {
  id: string;
  name: string;
  type: string;
  status: string | null;
  rag: string | null;
  baseline_budget: number;
  current_forecast: number;
  actuals_ytd: number;
  variance_pct: number;
  timeline: TimelineInfo | null;
  children: ProjectTreeNode[];
  // CY/PY splits
  baseline_cy?: number;
  forecast_cy?: number;
  actuals_cy?: number;
  baseline_py?: number;
  forecast_py?: number;
  actuals_py?: number;
}

export interface BudgetSnapshot {
  baseline: number;
  forecast: number;
  actuals_ytd: number;
  plan_drift_pct: number;
}

export interface SparklinePoint {
  month: string;
  amount: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  rag: string | null;
  budget_snapshot: BudgetSnapshot;
  timeline: TimelineInfo | null;
  last_cr_summary: string | null;
  forecast_sparkline: SparklinePoint[];
}

export interface BudgetByLob {
  lob_id: string;
  lob_name: string;
  forecast: number;
  baseline: number;
}

export interface ForecastTrajectoryPoint {
  month: string;
  baseline: number;
  forecast: number;
  actuals: number | null;
}

export interface ChartData {
  forecast_by_lob: BudgetByLob[];
  forecast_trajectory: ForecastTrajectoryPoint[];
  rag_distribution: Record<string, number>;
}

// Intake Queue

export interface IntakeItem {
  project_id: string;
  name: string;
  submitted_by: string | null;
  lob: string;
  estimated_budget: number | null;
  submission_date: string | null;
  status: string;
}

export interface IntakeResourcePlanItem {
  role_id: string;
  role_name: string;
  months: { month: string; hours: number; amount: number }[];
  total_hours: number;
  total_amount: number;
  assignments?: { month: string; person_id: string; person_name: string; hours: number }[];
}

export interface IntakeExternalCostItem {
  cost_type_id: string;
  cost_type_name: string;
  months: { month: string; amount: number }[];
  total_amount: number;
}

export interface IntakeBudgetSummary {
  internal_total: number;
  external_total: number;
  grand_total: number;
  capex_opex: string;
}

export interface IntakeDetail {
  project_id: string;
  name: string;
  description: string | null;
  lob_id: string;
  lob_name: string;
  start_month: string;
  end_month: string | null;
  estimated_budget: number | null;
  capex_opex: string;
  status: string;
  submission_feedback?: string | null;
  pl_name?: string | null;
  resource_plan?: IntakeResourcePlanItem[];
  external_cost_plan?: IntakeExternalCostItem[];
  budget_summary?: IntakeBudgetSummary;
  grid_data?: DetailViewGridDataResponse;
}

// Approvals

export interface ApprovalItem {
  cr_id: number;
  project_id: string;
  project_name: string;
  summary: string;
  submitted_by: string;
  confirmed_by_cc_owner: string | null;
  impact_eur_delta: number | null;
  submission_date: string;
  system_suggested: boolean;
}

export interface CRChangeDetail {
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  delta: string | null;
  line_item_type: string | null;
  month: string | null;
}

export interface CRDetail {
  id: number;
  project_id: string;
  project_name: string;
  status: string;
  change_category: string;
  summary: string;
  justification: string | null;
  is_system_suggested: boolean;
  submitted_by: string;
  submission_date: string;
  cc_owner: string | null;
  cc_status: string | null;
  cc_comments: string | null;
  controller: string | null;
  controller_status: string | null;
  controller_comments: string | null;
  controller_feedback: string | null;
  changes: CRChangeDetail[];
  grid_data?: DetailViewGridDataResponse;
}

// Reference data

export interface LoBRef {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  project_count: number;
  total_budget: number;
}

// --- Project Workbench ---

export interface WorkbenchProjectListItem {
  id: string;
  name: string;
  rag: string | null;
  type: string;
  status: string;
  is_service: boolean;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  lob: string;
  hierarchy_path?: { type_name: string; entity_name: string }[];
  status: string;
  rag: string | null;
  timeline: {
    start: string | null;
    end: string | null;
    projected_end: string | null;
  };
  pl_name: string | null;
}

export interface ThreePointComparison {
  baseline: number;
  forecast: number;
  actuals: number;
  plan_drift_pct: number;
  execution_variance: number;
  total_variance: number;
}

export interface TrajectoryPoint {
  month: string;
  baseline: number;
  forecast: number;
  actuals: number | null;
}

export interface ResourcePlanSummaryItem {
  role_id: string;
  role_name: string;
  total_hours: number;
}

export interface ProjectOverview {
  metadata: ProjectMetadata;
  three_point_comparison: ThreePointComparison;
  trajectory_chart: TrajectoryPoint[];
  capex_opex: { type: string; capex_amount?: number; opex_amount?: number; capex_pct?: number; opex_pct?: number };
  resource_plan_title: string;
  resource_plan_summary: ResourcePlanSummaryItem[];
}

// Timeline Visualization
export interface TimelineMonthPoint {
  month: string;
  baseline: number;
  forecast: number;
  actuals: number | null;
  is_elapsed: boolean;
  overrun: boolean;
}

export interface TimelineCumulativePoint {
  month: string;
  baseline: number;
  forecast: number;
  actuals: number | null;
}

export interface TimelineMilestone {
  name: string;
  sequence_number: number;
  baseline_start: string;
  baseline_end: string;
  forecast_start: string;
  forecast_end: string;
  color: string;
  slip_months: number;
}

export interface TimelineSummary {
  baseline_total: number;
  forecast_total: number;
  ytd_actuals: number;
  plan_drift: number;
  execution_variance: number;
}

export interface TimelineData {
  monthly_data: TimelineMonthPoint[];
  cumulative_data: TimelineCumulativePoint[];
  milestones: TimelineMilestone[];
  summary: TimelineSummary;
  budget_ceiling: number;
  today_month: string;
}

export interface ForecastMonthCell {
  month: string;
  forecast_hours: number;
  forecast_amount: number;
  baseline_hours: number;
  baseline_amount: number;
  actuals_hours: number;
  actuals_amount: number;
  // External cost procurement fields (only for category='external')
  ext_status?: string | null;
  po_number?: string | null;
  vendor?: string | null;
}

export interface PersonAssignment {
  person_id: string;
  person_name: string;
  months: { month: string; hours: number }[];
}

export interface ForecastGridRow {
  category: string;
  sub_category: string;
  sub_category_name: string;
  capex_opex?: string | null;
  months: ForecastMonthCell[];
  hourly_rate?: number | null; // Internal rows only
  assignments?: PersonAssignment[];
}

// ---------------------------------------------------------------------------
// C1 — Mixed-granularity forecast grid + version comparison
// (matches backend/schemas/workbench.py)
// ---------------------------------------------------------------------------

export type GridCellType = 'monthly' | 'quarterly';

export interface MixedGridColumn {
  key: string;                   // 'YYYY-MM' or 'YYYY-QN'
  label: string;
  cell_type: GridCellType;
}

export interface MixedGridCell {
  key: string;
  cell_type: GridCellType;
  hours: number;
  amount_eur: number;
  is_provisional: boolean;       // [C-FG-07]
  // v5.1 C-08 — three-point overlay (nullable). Populated only by the live
  // grid endpoint; ForecastVersion snapshots stay forecast-only.
  baseline_hours?: number | null;
  baseline_amount_eur?: number | null;
  actuals_hours?: number | null;
  actuals_amount_eur?: number | null;
  // True when actuals exist but only cover part of the cell (current month).
  actuals_partial?: boolean | null;
}

export interface MixedGridSubRow {
  // v5.1 C-05 / C-06 — one expandable child under a MixedGridRow.
  // Internal sub-rows: one per assigned employee; External sub-rows: one per
  // (vendor, po_number, role_type_id) tuple. Cell shape mirrors MixedGridCell
  // so the same renderer handles both.
  label: string;                 // primary display name
  sub_label?: string | null;     // secondary line (e.g. cost-centre)
  cells: MixedGridCell[];
  row_total: number;
  // Internal-only
  person_id?: string | null;
  cost_center_id?: string | null;
  // External-only
  vendor?: string | null;
  po_number?: string | null;
  role_type_id?: string | null;
  role_name?: string | null;
}

export interface MixedGridRow {
  category: string;              // 'internal' | 'external'
  sub_category: string;          // role/cost-type id
  capex_opex?: string | null;
  cells: MixedGridCell[];
  row_total: number;
  // v5.1 C-05 / C-06 — populated only when the grid endpoint is called with
  // include_person_breakdown / include_vendor_breakdown (default True from
  // the F&P grid; null elsewhere so ForecastVersion snapshots stay slim).
  sub_rows?: MixedGridSubRow[] | null;
  // v5.1 C-07 — derived role name on external rows when all contributing
  // line items share a single role_type_id; null otherwise (mixed roles
  // fall back to the [Category] label per spec).
  role_name?: string | null;
}

export interface MixedGridResponse {
  project_id: string;
  granularity: 'mixed' | 'monthly' | 'quarterly';
  boundary_month: string;        // last month rendered monthly (YYYY-MM)
  horizon_end_month: string;
  granularity_boundary_months: number;
  planning_horizon_months: number;
  columns: MixedGridColumn[];
  rows: MixedGridRow[];
  totals_by_column: Record<string, number>;
  grand_total: number;
}

export type ForecastVersionType = 'cycle' | 'cr_approval' | 'manual';

export interface ForecastVersionMeta {
  id: number;
  project_id: string;
  version_number: number;
  version_type: ForecastVersionType;
  cycle_label?: string | null;
  cycle_id?: string | null;
  change_request_id?: number | null;
  created_at: string;
  created_by_id: string;
  created_by_name?: string | null;
  granularity_boundary_months: number;
  planning_horizon_months: number;
  cell_count?: number | null;
  total_amount_eur?: number | null;
}

export interface ForecastVersionListResponse {
  items: ForecastVersionMeta[];
  total: number;
}

export interface ForecastVersionDetail {
  meta: ForecastVersionMeta;
  payload?: {
    schema_version: number;
    project_id: string;
    captured_at: string;
    boundary_month: string;
    horizon_end_month: string;
    rows: MixedGridRow[];
    totals_by_column: Record<string, number>;
    totals_by_category: Record<string, number>;
    grand_total: number;
  } | null;
}

export type CellDeltaStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface CellDelta {
  category: string;
  sub_category: string;
  cell_key: string;
  version_a_amount: number | null;
  version_b_amount: number | null;
  delta: number | null;
  status: CellDeltaStatus;
}

export interface ForecastVersionDiff {
  version_a_id: number;
  version_b_id: number;
  version_a_number: number;
  version_b_number: number;
  version_a_project_id: string;
  version_b_project_id: string;
  line_deltas: CellDelta[];
  summary: {
    added_count: number;
    removed_count: number;
    modified_count: number;
    total_changes: number;
  };
  grand_totals: {
    version_a: number;
    version_b: number;
    delta: number;
  };
}

export interface RetrospectiveItem {
  category: string;
  sub_category: string;
  forecast: number;
  actual: number;
  variance: number;
  variance_pct: number;
  significant: boolean;
  person_name?: string | null;
}

export interface ForecastCycleStartResponse {
  cycle_id: string;
  phase: number;
  retrospective_data: RetrospectiveItem[];
  skippable: boolean;
  retro_month?: string;
}

export interface SuggestionPreFilledChange {
  category: string;
  sub_category: string;
  month: string;
  old_value: number;
  new_value: number;
  delta: number;
  suggestion_id: number;
}

export interface SuggestionItem {
  id: number;
  type: string;
  observation: string;
  recommendation: string;
  impact_description: string;
  pre_filled_changes: SuggestionPreFilledChange[];
}

export interface ForecastChange {
  category: string;
  sub_category: string;
  month: string;
  old_value: number;
  new_value: number;
  delta: number;
  delta_eur?: number;
  suggestion_id?: number;
}

export interface ReviewGroup {
  type: string;
  items: ForecastChange[];
  count: number;
  justification?: string;
}

export interface ReviewGridLineItem {
  id: string;
  label: string;
  category: string;
  capex_opex: string | null;
  is_system_suggested: boolean;
  months: {
    month: string;
    before: number | null;
    after: number | null;
    delta: number | null;
    before_eur: number | null;
    after_eur: number | null;
    delta_eur: number | null;
  }[];
}

export interface ReviewGridData {
  months: string[];
  line_items: ReviewGridLineItem[];
}

export interface CostCentreGroup {
  id: string;
  name: string;
  line_items: { id: string; label: string }[];
  items: ForecastChange[];
  justification?: string;
}

export interface SubmittedCR {
  id: number;
  status: string;
  category: string;
}

export interface CRHistoryChange {
  field: string;
  old: string | null;
  new: string | null;
  delta: string | null;
  month: string | null;
}

export interface CRHistoryItem {
  id: number;
  project_id: string;
  status: string;
  change_category: string;
  summary: string;
  justification: string | null;
  is_system_suggested: boolean;
  submitted_by: string;
  submission_date: string;
  changes: CRHistoryChange[];
  impact_eur: number | null;
}

// --- Capacity Management ---

export interface CapacityContext {
  default_tab: string;
  managed_cost_center_id: string | null;
  pending_request_count: number;
}

export interface TeamSummary {
  headcount: number;
  avg_utilization_pct: number;
  over_allocated_count: number;
  pending_request_count: number;
}

export interface UtilizationCell {
  month: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'red';
  allocated_hours?: number;
  standard_hours?: number;
}

export interface PersonHeatmapRow {
  person_id: string;
  name: string;
  utilization: UtilizationCell[];
}

export interface ExternalCapacityRow {
  // v5.1 C-07 — synthetic 'External' resource row inside a role group.
  // FTE-equivalent count per month (external_amount_eur ÷ hourly_rate ÷ 160h).
  label: string;
  fte_equivalent: UtilizationCell[];
}

export interface RoleHeatmapRow {
  role_id: string;
  role_name: string;
  aggregate_utilization: UtilizationCell[];
  people: PersonHeatmapRow[];
  // v5.1 C-07 — optional external child row when the role has consulting /
  // leased-staff line items with role_type_id === role_id in scope.
  external?: ExternalCapacityRow | null;
}

export interface PersonMonthAllocation {
  month: string;
  total_hours: number;
  utilization_pct: number;
  projects: { project_id: string; project_name: string; hours: number }[];
}

export interface PersonDetail {
  person_id: string;
  name: string;
  role: string;
  allocations_by_month: PersonMonthAllocation[];
  pending_requests: { id: number; project_id: string; hours: number }[];
}

export interface CapacityRequestItem {
  id: number;
  project_id: string;
  project_name: string;
  request_type: string;
  role_or_cost_type: string;
  hours_or_amount: number;
  original_hours: number | null;
  change_direction: 'increase' | 'decrease' | null;
  period_start: string;
  period_end: string;
  priority: string;
  status: string;
  assigned_person_id: string | null;
  explanation: string | null;
}

export interface AssignmentProjection {
  month: string;
  current_hours: number;
  added_hours: number;
  total_hours: number;
  utilization_pct: number;
}

export interface AssignmentPreview {
  person_id: string;
  person_name: string;
  monthly_projections: AssignmentProjection[];
  exceeds_100_pct: boolean;
  recommendation: string;
}

export interface MonthlyHoursItem {
  month: string;
  hours: number;
  amount_eur: number;
}

export interface RequestAssignment {
  month: string;
  person_id: string;
  person_name: string;
  hours: number;
}

export interface ProjectAssignmentRequestItem extends CapacityRequestItem {
  assignment_count: number;
  total_months: number;
  fully_assigned: boolean;
}

export interface ProjectAssignmentDetail {
  project: {
    id: string;
    name: string;
    description: string;
    lob_name: string;
    pl_name: string | null;
    start_month: string;
    end_month: string | null;
    status: string;
  };
  cost_center_id: string | null;
  requests: ProjectAssignmentRequestItem[];
  all_resource_requests_assigned: boolean;
  change_request?: {
    id: number;
    summary: string;
    status: string;
  } | null;
}

export interface OrgSummary {
  total_headcount: number;
  avg_utilization_pct: number;
  over_allocated_cc_count: number;
  pending_controller_approval_count: number;
}

export interface OrgExternalSummary {
  // v5.1 C-07 — lightweight external-resource roll-up surfaced inside the
  // org-heatmap role pivot. ``count`` is the number of distinct projects
  // contributing external spend with this role assignment over the visible
  // window; ``total_fte`` is the avg monthly FTE-equivalent across the same
  // window.
  count: number;
  total_fte: number;
}

export interface OrgHeatmapRow {
  id: string;
  name: string;
  utilization: UtilizationCell[];
  children: OrgHeatmapRow[];
  // v5.1 C-07 — only present when the heatmap is pivoted by ``role``.
  external_summary?: OrgExternalSummary | null;
}

export interface OrgDetailEmployee {
  person_id: string;
  person_name: string;
  hours: number;
}

export interface OrgDetailItem {
  project_id: string;
  project_name: string;
  hours_allocated: number;
  has_pending_crs: boolean;
  employees?: OrgDetailEmployee[];
}

export interface OrgDetailResponse {
  items: OrgDetailItem[];
  total: number;
  allocated_hours: number;
  available_hours: number;
  delta: number;
}

// --- What-If Simulator ---

export interface ScenarioListItem {
  id: number;
  name: string;
  description: string | null;
  status: string;
  author_name: string;
  created_at: string;
  modified_at: string;
  headline_impact: string | null;
  // v5 B2 additions [B-SL-01..05]
  visibility?: string | null;
  tier3_content_flag?: boolean | null;
  archived?: boolean | null;
  archived_at?: string | null;
  tags?: string[] | null;
  anchor_forecast_version_id?: number | null;
  last_recalculated_at?: string | null;
}

export interface ScenarioListResponse {
  my_scenarios: ScenarioListItem[];
  published_scenarios: ScenarioListItem[];
  archived_scenarios?: ScenarioListItem[];
  available_tags?: string[];
}

export interface ScenarioCreateResponse {
  id: number;
  name: string;
  status: string;
}

export interface ScenarioAction {
  id: number;
  action_order: number;
  scope: string;
  action_type: string;
  project_id: string | null;
  parameters: Record<string, unknown>;
  impact_delta: Record<string, unknown>;
  group_label: string | null;
}

export interface ScenarioMetadata {
  id: number;
  name: string;
  description: string | null;
  status: string;
  author_name: string;
}

export interface TimeFrameSegment {
  label: string;
  year: number | null;
  original: number;
  adjusted: number;
  delta: number;
}

export interface ScenarioImpactDashboard {
  total_budget_original: number;
  total_budget_adjusted: number;
  total_budget_delta: number;
  rag_distribution: Record<string, number>;
  headline?: string;
  time_frame_breakdown?: TimeFrameSegment[];
}

export interface ScenarioProjectState {
  project_id: string;
  project_name: string;
  original_budget: number;
  adjusted_budget: number;
  budget_delta: number;
  original_rag: string | null;
  adjusted_rag: string | null;
  is_affected: boolean;
}

export interface ScenarioCapacityImpact {
  cost_center_id: string;
  month: string;
  original_utilization_pct: number;
  adjusted_utilization_pct: number;
  fte_delta: number;
}

export interface ScenarioDetail {
  metadata: ScenarioMetadata;
  actions: ScenarioAction[];
  impact_dashboard: ScenarioImpactDashboard;
  project_states: ScenarioProjectState[];
  capacity_impacts: ScenarioCapacityImpact[];
  narrative_summary?: string;
}

export interface ScenarioMetadataUpdateResponse {
  id: number;
  name: string;
  description: string | null;
}

export interface ScenarioStatusResponse {
  id: number;
  status: string;
}

// D4b types (defined now, used in D4b session)

export interface AdvisorHeadlineNumbers {
  budget_delta: number;
  projects_affected: number;
  capacity_impact: string;
  rag_changes: string;
}

export interface AdvisorConstituentAction {
  scope: string;
  project_id: string | null;
  action_type: string;
  parameters: Record<string, unknown>;
}

export interface AdvisorPath {
  path_id: string;
  name: string;
  approach_description: string;
  trade_offs: string;
  headline_numbers: AdvisorHeadlineNumbers;
  constituent_actions: AdvisorConstituentAction[];
}

export interface AdvisorQueryResponse {
  paths: AdvisorPath[];
  matched_goal?: string;
  message?: string;
}

export interface ComparisonColumnData {
  name: string;
  budget: number;
  delta?: number;
  rag: string | null;
}

export interface ComparisonColumn {
  label: string;
  scenario_id?: number;
  data: Record<string, ComparisonColumnData>;
}

export interface ComparisonResponse {
  columns: ComparisonColumn[];
  total_scenarios: number;
}

export interface DrillDownResponse {
  items: Record<string, unknown>[];
  total: number;
  level: string;
}

// --- Administration ---

export interface AdminContext {
  cost_center_count: number;
  people_count: number;
  lob_count: number;
  location_count: number;
  competence_center_count: number;
  last_rate_update: string | null;
  last_parameter_change: string | null;
}

export interface RefCostCenter {
  id: string;
  name: string;
  location_id: string;
  location_name: string;
  competence_center_id: string;
  competence_center_name: string;
  headcount: number;
  is_active: boolean;
}

export interface RefCompetenceCenterCC {
  id: string;
  name: string;
}

export interface RefCompetenceCenter {
  id: string;
  name: string;
  blended_rate: number;
  cost_centers: RefCompetenceCenterCC[];
  is_active: boolean;
}

export interface RefLocation {
  id: string;
  city: string;
  country: string;
  cost_center_count: number;
  is_active: boolean;
}

export interface RefRole {
  id: string;
  name: string;
  rates: { competence_center_id: string; competence_center_name: string; hourly_rate: number; effective_date: string }[];
}

export interface RefPerson {
  id: string;
  name: string;
  role_type_id: string;
  role_name: string;
  cost_center_id: string | null;
  cost_center_name: string;
  competence_center_id: string | null;
  competence_center_name: string;
  utilization_pct: number;
  is_active: boolean;
}

export interface AdminRateEntry {
  id: number;
  role_type_id: string;
  role_name: string;
  competence_center_id: string;
  competence_center_name: string;
  current_rate: number;
  effective_date: string;
  previous_rate: number | null;
  previous_effective_date: string | null;
}

export interface AdminParameter {
  key: string;
  name: string;
  description: string;
  current_value: string;
  default_value: string;
  data_type: string;
  group: string;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  user_name: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
}

// === Admin (D3) types — D1 + D2 + F1 surfaces ===

// Reference catalogues (D1)
export interface RoleTypeItem {
  id: string;
  name: string;
}
export interface ExternalCostTypeItem {
  id: string;
  name: string;
}

// Project dependencies (D1 / [D-AC-05])
export interface ProjectDependencyItem {
  id: number;
  predecessor_project_id: string;
  predecessor_project_name: string | null;
  successor_project_id: string;
  successor_project_name: string | null;
  dependency_type: string;
  lag_days: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
}

// Users (D1 / [D-AC-01..03])
export interface UserItem {
  id: string;
  username: string;
  display_name: string;
  role: string;
  person_id: string | null;
  tier3_flag: boolean;
  change_reviewer_flag: boolean;
  is_active: boolean;
}

// Per-entity-type role permission grants (F1 / [F-AC-01])
export interface RolePermissionGrantItem {
  id: number;
  role: string;
  entity_type: string;
  can_edit: boolean;
}

// Charging master data (F1 / [F-MD-01..03])
export interface CountryItem {
  id: string;
  iso_code: string;
  name: string;
  is_active: boolean;
}
export interface RegionItem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}
export interface ChargingLocationItem {
  id: string;
  code: string;
  name: string;
  division: string | null;
  region_id: string | null;
  region_name: string | null;
  country_id: string | null;
  country_iso_code: string | null;
  country_name: string | null;
  is_active: boolean;
}
export interface LegalEntityItem {
  id: string;
  code: string;
  name: string;
  charging_location_id: string | null;
  charging_location_code: string | null;
  charging_location_name: string | null;
  country_id: string | null;
  country_iso_code: string | null;
  country_name: string | null;
  is_active: boolean;
}

// User measurement matrix (F1 / [F-UM-01..04])
export interface UMVersionItem {
  imported_at: string;
  source: string;
  row_count: number;
}
export interface UMCellItem {
  id: number;
  year: number;
  quarter: number;
  s_code: string;
  charging_location_id: string;
  charging_location_code: string;
  charging_location_name: string | null;
  value: number;
  source: string;
  imported_at: string;
}
export interface UMRefreshStatus {
  status: 'not_connected' | 'connected' | string;
  message: string;
  last_refresh: string | null;
}
export interface UMImportResult {
  imported_at: string;
  inserted: number;
  skipped_zero: number;
  parse_errors: { row: number; message: string }[];
  source: string;
}

// Workflow templates (D2 / [D-CAT-07..10])
export interface WorkflowTemplateSummary {
  id: number;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  step_count: number;
}
export interface WorkflowStepActionItem {
  id: number;
  action_order: number;
  action_type: string;
  label: string;
  config: Record<string, unknown> | null;
}
export interface WorkflowStepItem {
  id: number;
  step_order: number;
  name: string;
  description: string | null;
  step_type: string;
  required: boolean;
  skippable: boolean;
  assigned_role: string | null;
  data_gates: string[] | null;
  notifications: Record<string, string[]> | null;
  time_constraint_days: number | null;
  escalation_action: string | null;
  is_active?: boolean;
  actions: WorkflowStepActionItem[];
}
export interface WorkflowTemplateDetail extends WorkflowTemplateSummary {
  steps: WorkflowStepItem[];
}

// Scheduled changes (D2 / [D-NAV-06..07])
export interface ScheduledChangeItem {
  id: number;
  entity_type: string;
  entity_id: string;
  description: string | null;
  pending_values: Record<string, unknown>;
  activation_date: string;
  review_status: string;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  activated_at: string | null;
  activation_error: string | null;
}
export interface ApplyScheduledChangesSummary {
  applied: number;
  skipped: number;
  errors: number;
  details: { id: number; entity_type: string; status: string; message: string | null }[];
}

// Audit log V2 (D2 / [D-AC-09])
export interface AuditCategoryRef {
  key: string;
  label: string;
}
export interface AuditEntryV2 {
  id: number;
  timestamp: string;
  user_name: string | null;
  user_id: string | null;
  category: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown> | null;
}
export interface AuditLogResponse {
  items: AuditEntryV2[];
  total: number;
  limit: number;
  offset: number;
}

// === End D3 types ===

// --- Documentation / FAQ ---

export interface FAQStep {
  step_number: number;
  instruction: string;
  target_module: string | null;
}

export interface FAQSummary {
  id: string;
  question: string;
  summary: string;
  applicable_roles: string[];
  modules_involved: string[];
}

export interface FAQDetail extends FAQSummary {
  steps: FAQStep[];
}

// --- Reporting ---

export interface ReportListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface SavedViewItem {
  id: number;
  report_id: string;
  name: string;
  config: ReportConfig;
  created_at: string;
  modified_at: string;
}

export interface ReportConfig {
  filters: Record<string, string>;
  columns: string[];
  grouping: string;
  sort_column: string;
  sort_direction: 'asc' | 'desc';
  viz_type: string;
}

export interface ProgrammeRollupRow {
  project_id: string;
  project_name: string;
  lob_id: string;
  lob_name: string;
  status: string;
  rag: string | null;
  baseline_budget: number;
  current_forecast: number;
  actuals_to_date: number;
  remaining_forecast: number;
  variance: number;
  variance_pct: number;
}

export interface ProgrammeRollupKPIs {
  project_count: number;
  total_baseline: number;
  total_forecast: number;
  overall_variance: number;
  overall_variance_pct: number;
  rag_distribution: Record<string, number>;
}

export interface ProgrammeRollupResponse {
  kpis: ProgrammeRollupKPIs;
  rows: ProgrammeRollupRow[];
  chart_data: { name: string; baseline: number; forecast: number; actuals: number }[];
  total: number;
}

export interface CCFinancialRow {
  project_id: string;
  project_name: string;
  internal_hours: number;
  internal_cost: number;
  external_cost: number;
  total_cost: number;
  pct_of_cc_budget: number;
  status: string;
}

export interface CCFinancialKPIs {
  total_budget_allocated: number;
  total_actuals: number;
  total_internal_cost: number;
  total_external_cost: number;
  active_project_count: number;
}

export interface CCFinancialResponse {
  kpis: CCFinancialKPIs;
  rows: CCFinancialRow[];
  chart_data: {
    pie: { name: string; value: number }[];
    trend: { month: string; spend: number }[];
  };
  total: number;
}

export interface VendorSpendRow {
  vendor_name: string;
  total_ordered: number;
  total_invoiced: number;
  total_open: number;
  total_accruals: number;
  project_count: number;
  po_count: number;
}

export interface VendorDrillDownRow {
  project_id: string;
  project_name: string;
  month: string;
  cost_type: string;
  amount: number;
  status: string | null;
  po_number: string | null;
}

export interface VendorSpendKPIs {
  total_vendor_spend: number;
  active_vendor_count: number;
  total_po_count: number;
  open_commitments: number;
}

export interface VendorSpendResponse {
  kpis: VendorSpendKPIs;
  rows: VendorSpendRow[];
  chart_data: {
    bar: { vendor: string; total: number }[];
  };
  total: number;
}

export interface ForecastAccuracyRow {
  project_id: string;
  project_name: string;
  lob_id: string;
  lob_name: string;
  forecast_value: number;
  actual_value: number;
  variance: number;
  variance_pct: number;
  accuracy_rating: string;
}

export interface ForecastAccuracyKPIs {
  avg_accuracy_pct: number;
  within_5_count: number;
  above_15_count: number;
  bias_direction: string;
  bias_amount: number;
}

export interface ForecastAccuracyResponse {
  kpis: ForecastAccuracyKPIs;
  rows: ForecastAccuracyRow[];
  chart_data: { project_name: string; forecast: number; actual: number; lob: string; rating: string }[];
  total: number;
}

export interface YoYMonthRow {
  month?: string;
  month_num?: number;
  project_id?: string;
  project_name?: string;
  lob_id?: string;
  lob_name?: string;
  fy_current: number;
  fy_previous: number;
  delta: number;
  delta_pct: number;
  cumulative_current?: number;
  cumulative_previous?: number;
}

export interface YoYKPIs {
  fy_current_ytd: number;
  fy_previous_ytd: number;
  ytd_delta: number;
  trajectory: string;
  fy_current_label: string;
  fy_previous_label: string;
}

export interface YoYResponse {
  kpis: YoYKPIs;
  rows: YoYMonthRow[];
  chart_data: {
    month: string;
    fy_current: number;
    fy_previous: number;
    fy_current_monthly: number;
    fy_previous_monthly: number;
  }[];
  total: number;
}

// --- AI Report Builder ---

export interface AIBuilderStatus {
  available: boolean;
  message: string | null;
}

export interface AIColumnDef {
  key: string;
  label: string;
  type: string; // text, currency, percent, number, date
}

export interface AITableSpec {
  columns: AIColumnDef[];
  rows: Record<string, unknown>[];
  sort_by?: string | null;
  sort_dir?: string | null;
}

export interface AIChartSpec {
  type: string; // bar, line, pie, donut
  title: string;
  data: Record<string, unknown>[];
  data_key: string;
  category_key: string;
  secondary_data_key?: string | null;
}

export interface AIKPIItem {
  label: string;
  value: number | string;
  format: string; // currency, number, percent, text
}

export interface AIReportSpec {
  title: string;
  kpis: AIKPIItem[];
  table: AITableSpec | null;
  charts: AIChartSpec[];
}

export interface AIConversationReply {
  conversation_id: string;
  text: string;
  report: AIReportSpec | null;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  report?: AIReportSpec | null;
}

// === Backlog / Ranking (A6) [A-BK-01..26] ===

export interface RankedProjectItem {
  rank: number | null;
  project_id: string;
  project_name: string;
  pipeline_stage: string | null;
  doi: number | null;
  project_type: number | null;
  composite_score: number | null;
  complexity_score: number | null;
  value_creation_score: number | null;
  transformation_level: string | null;
  tshirt_size: string | null;
  total_budget: number | null;
  within_cutoff: boolean | null;
  cumulative_budget_should_be: number | null;
  cumulative_budget_reality: number | null;
}

export interface CutoffLines {
  total_available_budget: number;
  type3_pre_funded_total: number;
  hyper_maintenance_committed_total: number;
  contestable_envelope: number;
  should_be_cutoff_rank: number | null;
  reality_cutoff_rank: number | null;
  misalignment_zone_start: number | null;
  misalignment_zone_end: number | null;
}

export interface RankingConfigSnapshot {
  total_available_budget: number;
  tiebreaker_order: string[];
  horizon_months: number;
}

export interface RankedBacklogResponse {
  items: RankedProjectItem[];
  total: number;
  pre_funded: RankedProjectItem[];
  pre_funded_total: number;
  cutoff: CutoffLines;
  config: RankingConfigSnapshot;
}

export interface CutoffLinesResponse {
  cutoff: CutoffLines;
  config: RankingConfigSnapshot;
}

// Intake queue item (used by A6 backlog "Under Evaluation" check)
export interface IntakeQueueItem {
  id: string;
  name: string;
  pipeline_stage: string | null;
  doi: number | null;
  project_type: number | null;
  composite_score: number | null;
  total_budget: number | null;
  tshirt_size: string | null;
  pl_person_id: string | null;
  submission_feedback: string | null;
  ai_council_approved: boolean | null;
}

// ===========================================================================
// === v5 Cluster F — Charging & Allocations (F4 / F5) [F-DM-01..04] ===
// ===========================================================================

export type ChargeableEntityType = 'Project' | 'Offering' | 'InternalService';

export interface ChargeableEntityItem {
  id: string;
  entity_type: ChargeableEntityType;
  identifier: string;
  name: string;
  description: string | null;
  hierarchy_node_id: string | null;
  responsible_person_id: string | null;
  to_business_pct: number;
  annual_cost: number | null;
  project_id: string | null;
  termination_month: string | null;
  is_active: boolean;
  is_change_or_run: 'Change' | 'Run';
}

// === Distribution edges (Stage 1) [F-S1-01..05] ===

export interface DistributionEdgeItem {
  id: number;
  year: number;
  version: string;
  source_entity_id: string;
  destination_entity_id: string;
  percentage: number;
  source_entity_name?: string | null;
  destination_entity_name?: string | null;
}

export interface EntityDistributionSummary {
  entity_id: string;
  entity_name: string;
  year: number;
  version: string;
  to_business_pct: number;
  distributions: DistributionEdgeItem[];
  self_retained_pct: number;
  sums_within_100: boolean;
}

export interface DistributionInflow {
  source_entity_id: string;
  source_entity_name: string;
  percentage: number;
  amount: number;
}

export interface DistributionEffectiveCost {
  entity_id: string;
  entity_name: string;
  year: number;
  version: string;
  own_cost: number;
  own_cost_source?: string | null;
  inflows: DistributionInflow[];
  inflow_total: number;
  effective_cost: number;
}

// 409 cycle-detection error body shape (per [F-S1-05])
export interface DistributionCycleError {
  detail: string;
  cycle_chain?: string[];
  cycle_chain_labels?: string[];
}

// === BTC Profiles (Stage 2) [F-S2-01..08] ===

export type BTCMode = 'manual' | 'automatic';
export type BTCStatus = 'draft' | 'active';

export interface BTCProfileLineItem {
  id: number;
  profile_id: number;
  charging_location_id: string;
  percentage: number;
  charging_location_code?: string | null;
  charging_location_name?: string | null;
}

export interface BTCProfileItem {
  id: number;
  entity_id: string;
  year: number;
  mode: BTCMode;
  s_code: string | null;
  um_snapshot_at: string | null;
  status: BTCStatus;
  copied_from_profile_id: number | null;
  lines: BTCProfileLineItem[];
  sums_to_100: boolean;
  created_at: string | null;
  modified_at: string | null;
}

export interface BTCRefreshDiffChangedRow {
  cl_id: string;
  old_pct: number | null;
  new_pct: number | null;
}

export interface BTCRefreshDiffResult {
  profile_id: number;
  s_code: string;
  year: number;
  quarter: number;
  added: string[];
  removed: string[];
  changed: BTCRefreshDiffChangedRow[];
  would_sum_to_100: boolean;
  committed: boolean;
}

// Lowercase entity-type values accepted by the year-rollover scope filter
// per Item 6. Mirrors the schemas/btc_profile.py YearRolloverRequest Literal.
export type BTCRolloverEntityType = 'project' | 'offering' | 'internal_service';

export interface BTCYearRolloverRequest {
  source_year: number;
  target_year: number;
  entity_types?: BTCRolloverEntityType[] | null;
  entity_ids?: string[] | null;
}

export interface BTCYearRolloverResult {
  source_year: number;
  target_year: number;
  rolled_over: number[];
  skipped: string[];
  errors: string[];
}

// === Rollup (Stage 1+2 effective costs) [F-RV-01..06] ===

export type RollupGroupBy =
  | 'entity'
  | 'entity_type'
  | 'hierarchy_node'
  | 'responsible'
  | 'change_or_run'
  | 'charging_location'
  | 'legal_entity'
  | 'region'
  | 'division'
  | 'country'
  | 'stage';

export interface RollupRowItem {
  group_key: string;
  group_label: string;
  dimension: string;
  year: number;
  version: string;
  entity_count: number;
  effective_cost: number;
  own_cost: number;
  inflow_total: number;
  stage2_amount: number | null;
}

export interface RollupListResponse {
  dimension: string;
  year: number;
  version: string;
  rows: RollupRowItem[];
  grand_total_effective: number;
  grand_total_own_cost: number;
  total: number;
}

export interface RollupDrillDownPath {
  path: string[];
  path_labels: string[];
}

export interface RollupDrillDownResponse {
  entity_id: string;
  entity_name: string;
  year: number;
  version: string;
  effective_cost: number;
  own_cost: number;
  inflow_total: number;
  stage2_amount?: number | null;
  paths: RollupDrillDownPath[];
}

export interface UpstreamChainResponse {
  entity_id: string;
  entity_name: string;
  year: number;
  version: string;
  paths: string[][];
  total: number;
}

// === Per-entity BTC allocation breakdown (Workbench BTC tab F6) [E-09] ===

export type AllocationBreakdownSortBy =
  | 'amount'
  | 'percentage'
  | 'location'
  | 'code'
  | 'region'
  | 'division'
  | 'country';

export interface EntityAllocationBreakdownRow {
  charging_location_id: string;
  charging_location_code: string | null;
  charging_location_name: string | null;
  region_name: string | null;
  division: string | null;
  country_iso_code: string | null;
  legal_entity_name: string | null;
  percentage: number;
  amount_eur: number;
}

export interface EntityAllocationBreakdownResponse {
  entity_id: string;
  entity_name: string;
  year: number;
  version: string;
  to_business_pct: number;
  effective_cost: number;
  business_amount_total: number;
  rows: EntityAllocationBreakdownRow[];
  profile_id: number | null;
  profile_status: BTCStatus | null;
  profile_mode: BTCMode | null;
  has_profile: boolean;
  sums_to_100: boolean;
  total: number;
}

// === Level-4 drill: per-charging-location breakdown ===

export interface LegalEntitySummary {
  id: string;
  code: string;
  name: string;
}

export interface LocationBreakdownEntity {
  entity_id: string;
  identifier: string;
  name: string;
  entity_type: ChargeableEntityType;
  doi: number | null;
  is_change_or_run: 'Change' | 'Run';
  percentage: number;
  amount_eur: number;
  share_pct: number;
}

export interface LocationBreakdownResponse {
  charging_location_id: string;
  charging_location_code: string;
  charging_location_name: string;
  region_name: string | null;
  division: string | null;
  country_iso_code: string | null;
  year: number;
  version: string;
  total_amount_eur: number;
  legal_entities: LegalEntitySummary[];
  chargeable_entities: LocationBreakdownEntity[];
  total: number;
}

// ===========================================================================
// === v5 Cluster E Session E5 — External cost views [E-08a..d] ===
// Backend: routers/workbench.py + routers/portfolio.py (E2 endpoints).
// ===========================================================================

/** Project-scoped vendor breakdown row per [E-08a]. */
export interface ProjectVendorSummaryRow {
  vendor_name: string;
  expense_cost_type: string;
  forecast_total: number;
  actuals_total: number;
  baseline_total: number;
  remaining: number;
  variance: number;
  po_count: number;
  line_count: number;
  // v5.1 C-07 — denormalised role attribution for the External Costs tab
  // Role column / filter chip. Null when the vendor's contributing line
  // items have mixed roles or no role assignment (matches the F&P grid
  // parent-label fallback rule per spec).
  role_type_id?: string | null;
  role_name?: string | null;
  // v5.1 C-09 — vendor-table column additions. Optional in pre-work
  // (backend zero-fills); Teammate A tightens optionality once Teammate C
  // populates the values from the new schema columns.
  contract_reference?: string | null;
  contract_end?: string | null; // YYYY-MM
  open_po?: number;
  remaining_not_invoiced?: number;
}

/** v5.1 C-09 — six top-level KPIs returned alongside vendor-summary rows. */
export interface ExternalCostsKpis {
  total_forecast: number;
  actuals_ytd: number;
  open_pos: number;
  remaining_not_invoiced: number;
  accruals: number;
  variance_vs_baseline: number;
}

export interface ProjectVendorSummaryResponse {
  items: ProjectVendorSummaryRow[];
  total: number;
  project_id: string;
  year: number | null;
  // v5.1 C-09 — single round-trip surfaces both rows and KPIs.
  kpis?: ExternalCostsKpis;
}

/** Project-scoped category rollup row per [E-08b]. */
export interface ProjectCategoryRollupRow {
  cost_type_id: string;
  cost_type_name: string;
  forecast_total: number;
  actuals_total: number;
  baseline_total: number;
  remaining: number;
  variance: number;
  vendor_count: number;
}

export interface ProjectCategoryRollupResponse {
  items: ProjectCategoryRollupRow[];
  total: number;
  project_id: string;
  year: number | null;
}

// ===========================================================================
// === v5.1 C-09 — External Costs monthly grid ===
// Backend: routers/workbench.py + services/external_cost_aggregation.py.
// Lead pre-work pins the contract; Teammate B builds the grid against
// these stubs and Teammate C makes the response match byte-for-byte.
// ===========================================================================

/** Single source of truth for the procurement-status enum. Mirrored on the
 * backend in `schemas/external_costs.py::ExternalCostStatus`. The status
 * badge component (`ExternalCostStatusBadge.tsx`) decides the visual
 * mapping — backend just emits these literals. */
export type ExternalCostStatus =
  | 'planned'
  | 'ordered'
  | 'goods_received'
  | 'invoiced'
  | 'accrual'
  | 'open';

/** One cell in the External Costs monthly grid. Only `month` is required;
 * stack lines (`forecast`, `actuals`, `accrual`, `po_obligo`) are omitted
 * when zero/null and are skipped in the frontend render. */
export interface ExternalCostMonthlyCell {
  month: string; // YYYY-MM
  forecast?: number | null;
  actuals?: number | null;
  accrual?: number | null;
  po_obligo?: number | null;
  status?: ExternalCostStatus | null;
}

export interface ExternalCostDeliveryRow {
  milestone_name: string;
  expected_month: string; // YYYY-MM
  expected_amount: number;
  delivered_month?: string | null; // null = not yet delivered
}

export interface ExternalCostInvoiceRow {
  invoice_number: string;
  invoice_date: string; // ISO date
  amount: number;
  status: string; // 'received' | 'paid'
}

/** One external cost line item, grouped by (vendor, sub_category, po_number, role). */
export interface ExternalCostMonthlyGridItem {
  line_id: string; // f"{vendor}|{sub_category}|{po_number ?? 'no-po'}"
  vendor: string;
  role_type_id?: string | null;
  role_name?: string | null;
  sub_category: string;
  sub_category_name: string;
  po_number?: string | null;
  contract_end_month?: string | null; // YYYY-MM
  status?: ExternalCostStatus | null;
  open_po: number;
  remaining_not_invoiced: number;
  monthly_cells: ExternalCostMonthlyCell[];
  delivery_schedule?: ExternalCostDeliveryRow[];
  invoice_history?: ExternalCostInvoiceRow[];
}

export interface ExternalCostMonthlyGridResponse {
  items: ExternalCostMonthlyGridItem[];
  year_columns: string[]; // ordered list of YYYY-MM keys for the grid axis
  year: number | null;
  project_id: string;
  total: number;
}

/** Portfolio-scoped vendor summary row per [E-08c]. */
export interface PortfolioVendorSummaryRow {
  vendor_name: string;
  expense_cost_type: string;
  project_count: number;
  forecast_total: number;
  actuals_total: number;
  top_project_id: string | null;
  top_project_name: string | null;
  top_project_amount: number;
  po_count: number;
}

export interface PortfolioVendorSummaryResponse {
  items: PortfolioVendorSummaryRow[];
  total: number;
  year: number | null;
}

/** Portfolio-scoped category analysis row per [E-08c]. */
export interface PortfolioCategoryAnalysisRow {
  cost_type_id: string;
  cost_type_name: string;
  forecast_total: number;
  actuals_total: number;
  project_count: number;
  vendor_count: number;
  pct_of_external_total: number;
}

export interface PortfolioCategoryAnalysisResponse {
  items: PortfolioCategoryAnalysisRow[];
  total: number;
  year: number | null;
}

/** Portfolio project × vendor cross-tab matrix per [E-08d]. */
export interface ProjectVendorMatrixCell {
  project_id: string;
  vendor_name: string;
  forecast_total: number;
  actuals_total: number;
}

export interface ProjectVendorMatrixProject {
  id: string;
  name: string;
  row_total: number;
}

export interface ProjectVendorMatrixVendor {
  name: string;
  col_total: number;
}

export interface ProjectVendorMatrixResponse {
  projects: ProjectVendorMatrixProject[];
  vendors: ProjectVendorMatrixVendor[];
  cells: ProjectVendorMatrixCell[];
  total: number;
  year: number | null;
}
