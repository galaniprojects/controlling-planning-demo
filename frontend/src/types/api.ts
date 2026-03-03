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
