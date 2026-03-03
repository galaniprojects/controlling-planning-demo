// Response envelope
export interface ListResponse<T> {
  items: T[];
  total: number;
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
  total_budget: number;
  ytd_spend: number;
  forecast_at_completion: number;
  overall_variance_pct: number;
  capex_opex_split: { capex: number; opex: number };
  run_change_ratio: string;
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
  budget: number;
}

export interface ForecastTrajectoryPoint {
  month: string;
  forecast: number;
}

export interface ChartData {
  budget_by_lob: BudgetByLob[];
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
  changes: CRChangeDetail[];
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
  actuals: number;
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
  capex_opex: { type: string };
  resource_plan_summary: ResourcePlanSummaryItem[];
}

export interface ForecastMonthCell {
  month: string;
  forecast_hours: number;
  forecast_amount: number;
  baseline_hours: number;
  baseline_amount: number;
  actuals_hours: number;
  actuals_amount: number;
}

export interface ForecastGridRow {
  category: string;
  sub_category: string;
  sub_category_name: string;
  months: ForecastMonthCell[];
}

export interface RetrospectiveItem {
  category: string;
  sub_category: string;
  forecast: number;
  actual: number;
  variance: number;
  variance_pct: number;
  significant: boolean;
}

export interface ForecastCycleStartResponse {
  cycle_id: string;
  phase: number;
  retrospective_data: RetrospectiveItem[];
  skippable: boolean;
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

export interface OrgDetailItem {
  project_id: string;
  project_name: string;
  hours_allocated: number;
  has_pending_crs: boolean;
}
