/**
 * v5 B2 — Promote routing-type labels.
 *
 * Mirrors the 12 `routing_type` values returned by
 * `services/scenario_promote.py::decide_routing` (lines 139–242). Each
 * lever-category maps to a routing_type that determines how a diff is
 * applied at Promote time. The frontend uses this map to render the
 * routing preview table per `[B-PR-03]`.
 *
 * Categories not in this map fall back to `'no_route'` (target-setters,
 * unrecognised lever_categories) — promote skips them with a message
 * surfaced inline.
 */

import type { LeverCategory } from '../catalogue/types';

export type RoutingType =
  | 'direct_forecast_update'
  | 'change_request'
  | 'doi_gate_check'
  | 'tech_navigator_direct'
  | 'tech_navigator_send_back'
  | 'rate_table_update'
  | 'people_action_item'
  | 'budget_envelope_update'
  | 'hypothetical_to_proposed'
  | 'hierarchy_update'
  | 'cost_allocation_update'
  | 'capacity_param_update'
  | 'no_route';

export interface RoutingLabel {
  title: string;
  description: string;
  /** Tailwind dark+light classes for the routing badge. */
  badgeClass: string;
}

export const ROUTING_LABELS: Record<RoutingType, RoutingLabel> = {
  direct_forecast_update: {
    title: 'Direct forecast update',
    description: 'Forecast value applied directly. No further review required.',
    badgeClass:
      'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  },
  change_request: {
    title: 'Change request',
    description:
      "Other-PL forecast change — generates a CR for the project's PL to acknowledge.",
    badgeClass:
      'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
  },
  doi_gate_check: {
    title: 'DoI gate check',
    description:
      'Pipeline stage transition — the DoI gate is evaluated; controller may override (audited) or drop.',
    badgeClass:
      'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
  },
  tech_navigator_direct: {
    title: 'Tech Navigator update',
    description:
      'Tech Navigator score change on own project — applied directly.',
    badgeClass:
      'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  },
  tech_navigator_send_back: {
    title: 'Tech Navigator send-back',
    description:
      'Tech Navigator score change on another PL\'s project — sent back to the PL with the suggested scores.',
    badgeClass:
      'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
  },
  rate_table_update: {
    title: 'Rate table update',
    description:
      'Rate table change — admin path with effective date. Cascades through cost calculations.',
    badgeClass:
      'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  },
  people_action_item: {
    title: 'HR action item',
    description:
      'People / restructuring change — generates a structured action item for HR or manual admin action. Not auto-applied.',
    badgeClass:
      'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300',
  },
  budget_envelope_update: {
    title: 'Budget envelope update',
    description: 'Direct update to the Backlog & Ranking configuration.',
    badgeClass:
      'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  },
  hypothetical_to_proposed: {
    title: 'Hypothetical → Proposed',
    description:
      'Hypothetical project promoted to a real Proposed project (DoI 0).',
    badgeClass:
      'border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300',
  },
  hierarchy_update: {
    title: 'Hierarchy update',
    description: 'Hierarchy reassignment applied directly.',
    badgeClass:
      'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  },
  cost_allocation_update: {
    title: 'Cost allocation update',
    description:
      'Lever 12 (Stage 1 distribution edge / Stage 2 BTC) — copied back from sandbox to canonical version.',
    badgeClass:
      'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  },
  capacity_param_update: {
    title: 'Capacity parameter update',
    description: 'Capacity override — admin path with effective date.',
    badgeClass:
      'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  },
  no_route: {
    title: 'No native route',
    description:
      'No native workflow registered — the diff is informational only and will be skipped if confirmed.',
    badgeClass:
      'border-muted-foreground/40 text-muted-foreground',
  },
};

/**
 * Best-effort mapping from `lever_category` to the routing the
 * Promote service is going to choose. Used only for *previewing*
 * routing on the catalogue side (e.g. badge on action tile). The
 * authoritative mapping comes from `promotePreview()`.
 */
export const LEVER_TO_ROUTING_HINT: Record<LeverCategory, RoutingType> = {
  forecast_grid: 'direct_forecast_update',
  pipeline_stage: 'doi_gate_check',
  tech_navigator: 'tech_navigator_direct',
  rate_table: 'rate_table_update',
  people: 'people_action_item',
  restructuring: 'people_action_item',
  budget_envelope: 'budget_envelope_update',
  hypothetical_project: 'hypothetical_to_proposed',
  hierarchy: 'hierarchy_update',
  cost_allocation: 'cost_allocation_update',
  capacity_param: 'capacity_param_update',
  milestone: 'no_route',
  other: 'no_route',
};

/**
 * Group routing decisions by the broader category for the diff selector.
 * Maps each routing_type to a category id used as the section header.
 */
export const ROUTING_CATEGORY: Record<
  RoutingType,
  'forecast' | 'pipeline' | 'tech_navigator' | 'rates' | 'people' | 'envelope' | 'hypothetical' | 'hierarchy' | 'cost_allocation' | 'capacity' | 'other'
> = {
  direct_forecast_update: 'forecast',
  change_request: 'forecast',
  doi_gate_check: 'pipeline',
  tech_navigator_direct: 'tech_navigator',
  tech_navigator_send_back: 'tech_navigator',
  rate_table_update: 'rates',
  people_action_item: 'people',
  budget_envelope_update: 'envelope',
  hypothetical_to_proposed: 'hypothetical',
  hierarchy_update: 'hierarchy',
  cost_allocation_update: 'cost_allocation',
  capacity_param_update: 'capacity',
  no_route: 'other',
};

export const ROUTING_CATEGORY_LABEL: Record<
  ReturnType<typeof routingCategory>,
  string
> = {
  forecast: 'Forecast diffs',
  pipeline: 'Pipeline transitions',
  tech_navigator: 'Tech Navigator scores',
  rates: 'Rate table changes',
  people: 'People & restructuring',
  envelope: 'Budget envelope',
  hypothetical: 'Hypothetical projects',
  hierarchy: 'Hierarchy reassignment',
  cost_allocation: 'Cost allocation (Lever 12)',
  capacity: 'Capacity parameters',
  other: 'Other / no native route',
};

export function routingCategory(rt: RoutingType) {
  return ROUTING_CATEGORY[rt];
}

export const CATEGORY_ORDER: Array<ReturnType<typeof routingCategory>> = [
  'forecast',
  'pipeline',
  'tech_navigator',
  'rates',
  'cost_allocation',
  'envelope',
  'hierarchy',
  'hypothetical',
  'capacity',
  'people',
  'other',
];
