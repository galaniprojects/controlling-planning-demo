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
