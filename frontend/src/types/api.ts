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

export interface TimelinePhase {
  name: string;
  phase_number: number;
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
  phases: TimelinePhase[];
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

export interface ForecastGridRow {
  category: string;
  sub_category: string;
  sub_category_name: string;
  capex_opex?: string | null;
  months: ForecastMonthCell[];
  hourly_rate?: number | null; // Internal rows only
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
  months: { month: string; before: number | null; after: number | null; delta: number | null }[];
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

export interface RoleHeatmapRow {
  role_id: string;
  role_name: string;
  aggregate_utilization: UtilizationCell[];
  people: PersonHeatmapRow[];
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
}

export interface OrgSummary {
  total_headcount: number;
  avg_utilization_pct: number;
  over_allocated_cc_count: number;
  pending_controller_approval_count: number;
}

export interface OrgHeatmapRow {
  id: string;
  name: string;
  utilization: UtilizationCell[];
  children: OrgHeatmapRow[];
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
}

export interface ScenarioListResponse {
  my_scenarios: ScenarioListItem[];
  published_scenarios: ScenarioListItem[];
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
