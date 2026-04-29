/**
 * v5 B2 — Catalogue action types.
 *
 * Defines the data shape used by every catalogue action surface
 * (`projectLevel/`, `portfolioRules/`, `targetSetters/`, `restructuring/`).
 * Each action declares its scope, lever_category, tier, parameter
 * fields, and (optionally) a custom impact-summary helper. The shared
 * `ActionForm` component renders any `ActionDefinition` automatically.
 *
 * The 21+ catalogue actions per `[B-ES-01]` and spec lines 892–946 all
 * route through the single B1 dispatch endpoint
 * (`POST /api/scenarios/:id/actions` — see `backend/routers/scenarios.py:536`).
 * `lever_category` + `tier` are persisted on `ScenarioAction` and drive
 * Promote routing (`backend/services/scenario_promote.py:139`
 * `decide_routing`) plus impact-dashboard redaction.
 */

/**
 * The Promote service's category switch (services/scenario_promote.py)
 * recognises these values. Catalogue actions MUST set one of these
 * unless the action is informational (target-setters → "other").
 */
export type LeverCategory =
  | 'forecast_grid'
  | 'pipeline_stage'
  | 'tech_navigator'
  | 'rate_table'
  | 'people'
  | 'restructuring'
  | 'budget_envelope'
  | 'hypothetical_project'
  | 'hierarchy'
  | 'cost_allocation'
  | 'capacity_param'
  | 'milestone'
  | 'other';

export type ActionScope = 'project' | 'portfolio';
export type ActionTier = 1 | 2 | 3;

export type FieldType =
  | 'number'
  | 'percent'
  | 'currency'
  | 'text'
  | 'month'
  | 'select'
  | 'multi-select'
  | 'textarea';

/** Reference data sources the form will fetch on mount when needed. */
export type ReferenceSource =
  | 'projects'
  | 'roles'
  | 'cost_centers'
  | 'locations'
  | 'cost_types'
  | 'hierarchy_nodes'
  | 'rate_tables'
  | 'project_types'
  | 'transformation_levels';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  /** Parameter key sent to backend in `parameters_json`. */
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  /** Static options for select/multi-select. */
  options?: FieldOption[];
  /** When set, the form fetches options from this reference source. */
  referenceSource?: ReferenceSource;
  /** Field is shown only if `dependsOn` field equals one of these values. */
  dependsOn?: { field: string; equals: string[] };
  /** Default value (string-typed; coerced on submit). */
  defaultValue?: string;
  /** For numeric / percent fields. */
  min?: number;
  max?: number;
}

export interface ActionDefinition {
  /** Unique catalogue id (used as React key + URL slug). */
  id: string;
  /** Backend action_type string sent to `POST /actions`. */
  actionType: string;
  /** Project / portfolio scope. */
  scope: ActionScope;
  /** Display label in the catalogue panel. */
  label: string;
  /** One-line description shown in the action picker / form intro. */
  description: string;
  /** Promote routing category. */
  leverCategory: LeverCategory;
  /** Permission tier. Tier 3 actions are filtered out for non-Tier-3 users. */
  tier: ActionTier;
  /** Catalogue category (drives section grouping in the panel). */
  category: 'projectLevel' | 'portfolioRules' | 'targetSetters' | 'restructuring';
  /** True when the action requires a project_id parameter. */
  requiresProject: boolean;
  /** Parameter fields rendered by `ActionForm`. */
  fields: FieldDefinition[];
  /** Lucide icon name to render in the catalogue tile (optional). */
  icon?: string;
  /** True for target-setters — they are informational and skipped at Promote. */
  informational?: boolean;
}

/** Shape submitted to ScenarioContext.applyAction(). */
export interface CatalogueActionSubmission {
  scope: ActionScope;
  action_type: string;
  project_id?: string;
  parameters: Record<string, unknown>;
  lever_category: LeverCategory;
  tier: ActionTier;
}
