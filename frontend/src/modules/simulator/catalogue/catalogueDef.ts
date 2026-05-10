/**
 * v5 B2 — Catalogue action definitions.
 *
 * The 21+ catalogue actions per spec lines 892–946 (#1–10 project-level,
 * #11–17 portfolio rules, #18–19 target-setters, #20–23 restructuring
 * Tier 3). The spec headline "Twenty-one pre-defined actions" predates
 * the additions of Cut-by-Transformation (#13) and Adjust-rate-table
 * (#17); the four detailed tables enumerate 23 distinct items, all of
 * which we implement.
 *
 * Each action carries the `action_type` string consumed by
 * `services/scenario_engine.py::_apply_action` (and `_ACTION_ALIASES`
 * line 29 for legacy compatibility). New action types not yet wired
 * into the engine still create a `ScenarioAction` row — they appear in
 * the change summary, drive routing previews, and are routable at
 * Promote time. Engine-level financial impact for unknown types is a
 * no-op for the demo; the action's lever_category + parameters carry
 * intent and are sufficient for the diff view.
 *
 * `leverCategory` drives `services/scenario_promote.py::decide_routing`
 * — keep these aligned. Target-setters use `'other'` (no routable side
 * effect; they are gap analysis only).
 */

import type { ActionDefinition } from './types';

// =============================================================================
// 1–10 PROJECT-LEVEL (10) — applied to selected project(s)
// =============================================================================

const PROJECT_LEVEL: ActionDefinition[] = [
  {
    id: 'remove-project',
    actionType: 'remove_project',
    scope: 'project',
    label: 'Remove project',
    description:
      'Zero out all future forecast values. The project disappears from ranking but stays in master data.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Trash2',
    fields: [
      {
        key: 'reason',
        label: 'Reason (optional)',
        type: 'textarea',
        placeholder: 'Strategic descope, scope drift, decision rationale…',
      },
    ],
  },
  {
    id: 'pause-project',
    actionType: 'pause_project',
    scope: 'project',
    label: 'Pause project',
    description:
      'Zero out future values from a specified month onward. Pipeline stage moves to Paused.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Pause',
    fields: [
      {
        key: 'start_month',
        label: 'Pause from',
        type: 'month',
        placeholder: '2026-04',
        required: true,
      },
    ],
  },
  {
    id: 'delay-project',
    actionType: 'delay_project',
    scope: 'project',
    label: 'Delay project',
    description:
      'Shift the entire remaining timeline and forecast forward by N months.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'ChevronsRight',
    fields: [
      {
        key: 'months',
        label: 'Months to delay',
        type: 'number',
        placeholder: '3',
        required: true,
        min: 1,
        max: 36,
      },
    ],
  },
  {
    id: 'accelerate-project',
    actionType: 'accelerate_project',
    scope: 'project',
    label: 'Accelerate project',
    description:
      'Compress the remaining timeline by N months, concentrating the remaining budget.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'ChevronsLeft',
    fields: [
      {
        key: 'months',
        label: 'Months forward',
        type: 'number',
        placeholder: '3',
        required: true,
        min: 1,
        max: 24,
      },
    ],
  },
  {
    id: 'scale-budget',
    actionType: 'adjust_budget',
    scope: 'project',
    label: 'Scale budget',
    description:
      'Increase or decrease all future forecast lines by a percentage, uniformly across cost categories.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Scale',
    fields: [
      {
        key: 'percentage',
        label: 'Scale (%)',
        type: 'percent',
        placeholder: '-15',
        required: true,
        min: -100,
        max: 200,
        helpText: 'Negative = decrease, positive = increase.',
      },
    ],
  },
  {
    id: 'change-sourcing-mix',
    actionType: 'change_sourcing_mix',
    scope: 'project',
    label: 'Change sourcing mix',
    description:
      'Shift a percentage of internal hours to external (or vice versa) across all role lines. Rate differential applies automatically.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Replace',
    fields: [
      {
        key: 'shift_direction',
        label: 'Shift direction',
        type: 'select',
        required: true,
        options: [
          { value: 'internal_to_external', label: 'Internal → External' },
          { value: 'external_to_internal', label: 'External → Internal' },
        ],
      },
      {
        key: 'percentage',
        label: 'Percentage to shift',
        type: 'percent',
        placeholder: '20',
        required: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: 'set-termination-date',
    actionType: 'set_termination_date',
    scope: 'project',
    label: 'Set termination date',
    description:
      'For Operate-stage projects, set or change the termination date. Running costs after that date are zeroed.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'CalendarX',
    fields: [
      {
        key: 'termination_month',
        label: 'Termination month',
        type: 'month',
        placeholder: '2027-12',
        required: true,
      },
    ],
  },
  {
    id: 'clone-project',
    actionType: 'clone_project',
    scope: 'project',
    label: 'Clone project (hypothetical)',
    description:
      'Create a hypothetical duplicate with the same forecast profile. Useful for "what if we run a second instance".',
    leverCategory: 'hypothetical_project',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Copy',
    fields: [
      {
        key: 'clone_name_suffix',
        label: 'Suffix for clone name',
        type: 'text',
        placeholder: '(copy)',
        defaultValue: '(copy)',
      },
    ],
  },
  {
    id: 'adjust-vendor-contract',
    actionType: 'adjust_vendor_contract',
    scope: 'project',
    label: 'Adjust vendor contract',
    description:
      'Change contracted amount, payment schedule, or rate for a specific external deliverable line.',
    leverCategory: 'forecast_grid',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'FileEdit',
    fields: [
      {
        key: 'cost_type_id',
        label: 'Cost category',
        type: 'select',
        referenceSource: 'cost_types',
        required: true,
      },
      {
        key: 'adjustment_pct',
        label: 'Contract adjustment (%)',
        type: 'percent',
        placeholder: '-10',
        required: true,
        min: -50,
        max: 100,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
      },
    ],
  },
  {
    id: 'change-external-rate',
    actionType: 'change_external_rate',
    scope: 'project',
    label: 'Change external rate',
    description:
      'Modify the per-project external hourly rate for a specific role/vendor combination.',
    leverCategory: 'rate_table',
    tier: 1,
    category: 'projectLevel',
    requiresProject: true,
    icon: 'Euro',
    fields: [
      {
        key: 'role_type_id',
        label: 'Role',
        type: 'select',
        referenceSource: 'roles',
        required: true,
      },
      {
        key: 'new_rate',
        label: 'New rate (€/h)',
        type: 'currency',
        placeholder: '120',
        required: true,
        min: 0,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
      },
    ],
  },
];

// =============================================================================
// 11–17 PORTFOLIO RULES (7) — blanket actions across the portfolio
// =============================================================================

const PORTFOLIO_RULES: ActionDefinition[] = [
  {
    id: 'cut-by-hierarchy',
    actionType: 'cut_by_hierarchy',
    scope: 'portfolio',
    label: 'Cut by hierarchy node',
    description:
      'Reduce all projects under a specific hierarchy node by a percentage.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'Network',
    fields: [
      {
        key: 'hierarchy_node_id',
        label: 'Hierarchy node',
        type: 'select',
        referenceSource: 'hierarchy_nodes',
        required: true,
      },
      {
        key: 'percentage',
        label: 'Cut percentage',
        type: 'percent',
        placeholder: '15',
        required: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: 'cut-by-type',
    actionType: 'cut_by_type',
    scope: 'portfolio',
    label: 'Cut by project type',
    description:
      'Reduce all P1, P2, or all non-P3 projects by a percentage.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'LayoutList',
    fields: [
      {
        key: 'target_type',
        label: 'Target type',
        type: 'select',
        required: true,
        options: [
          { value: '1', label: 'P1 — Mandatory / regulatory' },
          { value: '2', label: 'P2 — Discretionary change' },
          { value: 'non_type_3', label: 'All non-P3' },
        ],
      },
      {
        key: 'reduction_pct',
        label: 'Reduction (%)',
        type: 'percent',
        placeholder: '10',
        required: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: 'cut-by-transformation',
    actionType: 'cut_by_transformation',
    scope: 'portfolio',
    label: 'Cut by Transformation level',
    description: 'Reduce all T0, T1, or T2 projects by a percentage.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'TrendingDown',
    fields: [
      {
        key: 'transformation_level',
        label: 'Transformation level',
        type: 'select',
        required: true,
        options: [
          { value: 'T0', label: 'T0 — Run-the-business' },
          { value: 'T1', label: 'T1 — Optimise' },
          { value: 'T2', label: 'T2 — Transform' },
        ],
      },
      {
        key: 'percentage',
        label: 'Cut percentage',
        type: 'percent',
        placeholder: '10',
        required: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: 'across-the-board-cut',
    actionType: 'across_the_board_cut',
    scope: 'portfolio',
    label: 'Across-the-board cut',
    description:
      'Reduce all non-P3 projects by a percentage. P3 projects are exempt.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'Minus',
    fields: [
      {
        key: 'percentage',
        label: 'Cut percentage',
        type: 'percent',
        placeholder: '15',
        required: true,
        min: 0,
        max: 100,
      },
    ],
  },
  {
    id: 'freeze-new-starts',
    actionType: 'freeze_new_starts',
    scope: 'portfolio',
    label: 'Freeze new starts',
    description:
      'Zero out all projects with planned start date after a specified month.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'Snowflake',
    fields: [
      {
        key: 'cutoff_month',
        label: 'Freeze starts after',
        type: 'month',
        placeholder: '2026-06',
        required: true,
      },
    ],
  },
  {
    id: 'apply-escalation',
    actionType: 'rate_escalation',
    scope: 'portfolio',
    label: 'Apply escalation factor',
    description:
      'Increase costs by a percentage from a specified month onward, optionally scoped by category, role, or hierarchy.',
    leverCategory: 'forecast_grid',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'TrendingUp',
    fields: [
      {
        key: 'scope_type',
        label: 'Scope dimension',
        type: 'select',
        required: true,
        options: [
          { value: 'role', label: 'Role' },
          { value: 'cost_center', label: 'Cost centre' },
          { value: 'location', label: 'Location' },
        ],
      },
      {
        key: 'scope_values',
        label: 'Scope values',
        type: 'multi-select',
        dependsOn: { field: 'scope_type', equals: ['role', 'cost_center', 'location'] },
        helpText: 'Choose one or more matching items from the selected dimension.',
      },
      {
        key: 'increase_pct',
        label: 'Increase (%)',
        type: 'percent',
        placeholder: '5',
        required: true,
        min: 0,
        max: 100,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
  {
    id: 'adjust-rate-table',
    actionType: 'adjust_rate_table',
    scope: 'portfolio',
    label: 'Adjust rate table',
    description:
      'Increase or decrease all rates in a rate table by a percentage, optionally scoped by location or role.',
    leverCategory: 'rate_table',
    tier: 2,
    category: 'portfolioRules',
    requiresProject: false,
    icon: 'Calculator',
    fields: [
      {
        key: 'rate_table_scope',
        label: 'Rate table',
        type: 'select',
        required: true,
        options: [
          { value: 'internal', label: 'Internal rates' },
          { value: 'external', label: 'External rates' },
        ],
      },
      {
        key: 'location_id',
        label: 'Location filter (optional)',
        type: 'select',
        referenceSource: 'locations',
      },
      {
        key: 'role_type_id',
        label: 'Role filter (optional)',
        type: 'select',
        referenceSource: 'roles',
      },
      {
        key: 'percentage',
        label: 'Adjustment (%)',
        type: 'percent',
        placeholder: '3',
        required: true,
        min: -50,
        max: 100,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
];

// =============================================================================
// 18–19 TARGET-SETTERS (2) — informational gap analysis
// =============================================================================

const TARGET_SETTERS: ActionDefinition[] = [
  {
    id: 'set-outsourcing-target',
    actionType: 'set_outsourcing_target',
    scope: 'portfolio',
    label: 'Set outsourcing target',
    description:
      'Specify target internal/external ratio. The system surfaces projects furthest from target and the cost delta to reach it. Does not auto-adjust the portfolio.',
    leverCategory: 'other',
    tier: 2,
    category: 'targetSetters',
    requiresProject: false,
    informational: true,
    icon: 'Target',
    fields: [
      {
        key: 'target_external_pct',
        label: 'Target external share (%)',
        type: 'percent',
        placeholder: '40',
        required: true,
        min: 0,
        max: 100,
      },
      {
        key: 'tolerance_pct',
        label: 'Tolerance band (±%)',
        type: 'percent',
        placeholder: '5',
        defaultValue: '5',
        min: 0,
        max: 50,
      },
    ],
  },
  {
    id: 'set-investment-mix-target',
    actionType: 'set_investment_mix_target',
    scope: 'portfolio',
    label: 'Set investment mix target',
    description:
      'Specify target budget percentages by hierarchy node, Type, or Transformation level. Shows current vs. target distribution gap.',
    leverCategory: 'other',
    tier: 2,
    category: 'targetSetters',
    requiresProject: false,
    informational: true,
    icon: 'PieChart',
    fields: [
      {
        key: 'mix_dimension',
        label: 'Dimension',
        type: 'select',
        required: true,
        options: [
          { value: 'hierarchy', label: 'Hierarchy node' },
          { value: 'type', label: 'Project type' },
          { value: 'transformation', label: 'Transformation level' },
        ],
      },
      {
        key: 'target_distribution',
        label: 'Target distribution',
        type: 'textarea',
        helpText:
          'JSON object: {"node_id_or_key": percentage}. Percentages should sum to 100.',
        placeholder: '{"T2": 40, "T1": 35, "T0": 25}',
        required: true,
      },
    ],
  },
];

// =============================================================================
// 20–23 RESTRUCTURING (4) — Tier 3 only
// =============================================================================

const RESTRUCTURING: ActionDefinition[] = [
  {
    id: 'remove-role',
    actionType: 'remove_role',
    scope: 'portfolio',
    label: 'Remove role from portfolio',
    description:
      'Zero out all allocations for a role across all projects (or within a scoped hierarchy node). Shows cascade: affected projects, cost saving, capacity gaps.',
    leverCategory: 'restructuring',
    tier: 3,
    category: 'restructuring',
    requiresProject: false,
    icon: 'UserMinus',
    fields: [
      {
        key: 'role_type_id',
        label: 'Role',
        type: 'select',
        referenceSource: 'roles',
        required: true,
      },
      {
        key: 'hierarchy_node_id',
        label: 'Scope to hierarchy (optional)',
        type: 'select',
        referenceSource: 'hierarchy_nodes',
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
  {
    id: 'reduce-headcount',
    actionType: 'reduce_headcount',
    scope: 'portfolio',
    label: 'Reduce headcount by location',
    description:
      'Reduce available FTEs at a location by N people or N%. Reduces the available capacity pool; shows which projects are affected by tighter supply. Does not pick specific people.',
    leverCategory: 'restructuring',
    tier: 3,
    category: 'restructuring',
    requiresProject: false,
    icon: 'Users',
    fields: [
      {
        key: 'location_id',
        label: 'Location',
        type: 'select',
        referenceSource: 'locations',
        required: true,
      },
      {
        key: 'reduction_mode',
        label: 'Reduction mode',
        type: 'select',
        required: true,
        options: [
          { value: 'absolute', label: 'Absolute FTE count' },
          { value: 'percent', label: 'Percentage' },
        ],
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        placeholder: '5',
        required: true,
        min: 0,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
  {
    id: 'relocate-team',
    actionType: 'relocate_team',
    scope: 'portfolio',
    label: 'Relocate team',
    description:
      'Move a set of people (or headcount block by role) from one cost centre/location to another. Rate differentials apply automatically.',
    leverCategory: 'restructuring',
    tier: 3,
    category: 'restructuring',
    requiresProject: false,
    icon: 'MoveRight',
    fields: [
      {
        key: 'source_location_id',
        label: 'Source location',
        type: 'select',
        referenceSource: 'locations',
        required: true,
      },
      {
        key: 'destination_location_id',
        label: 'Destination location',
        type: 'select',
        referenceSource: 'locations',
        required: true,
      },
      {
        key: 'role_type_id',
        label: 'Role filter (optional)',
        type: 'select',
        referenceSource: 'roles',
      },
      {
        key: 'headcount',
        label: 'Headcount to relocate',
        type: 'number',
        placeholder: '5',
        required: true,
        min: 0,
      },
      {
        key: 'effective_month',
        label: 'Effective from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
  {
    id: 'hire-block',
    actionType: 'hire_block',
    scope: 'portfolio',
    label: 'Hire block',
    description:
      'Add N hypothetical people with a specified role and location, available from a specified month. They enter the capacity pool; the system shows utilization impact and which understaffed projects could absorb them.',
    leverCategory: 'restructuring',
    tier: 3,
    category: 'restructuring',
    requiresProject: false,
    icon: 'UserPlus',
    fields: [
      {
        key: 'role_type_id',
        label: 'Role',
        type: 'select',
        referenceSource: 'roles',
        required: true,
      },
      {
        key: 'location_id',
        label: 'Location',
        type: 'select',
        referenceSource: 'locations',
        required: true,
      },
      {
        key: 'headcount',
        label: 'Headcount to hire',
        type: 'number',
        placeholder: '5',
        required: true,
        min: 1,
      },
      {
        key: 'available_from',
        label: 'Available from',
        type: 'month',
        placeholder: '2026-07',
        required: true,
      },
    ],
  },
];

// =============================================================================
// Public exports
// =============================================================================

export const CATALOGUE_PROJECT_LEVEL = PROJECT_LEVEL;
export const CATALOGUE_PORTFOLIO_RULES = PORTFOLIO_RULES;
export const CATALOGUE_TARGET_SETTERS = TARGET_SETTERS;
export const CATALOGUE_RESTRUCTURING = RESTRUCTURING;

export const ALL_ACTIONS: ActionDefinition[] = [
  ...PROJECT_LEVEL,
  ...PORTFOLIO_RULES,
  ...TARGET_SETTERS,
  ...RESTRUCTURING,
];

/** Look up an action by id (URL slug) — used by ActionForm router. */
export function findActionById(id: string): ActionDefinition | undefined {
  return ALL_ACTIONS.find((a) => a.id === id);
}

/**
 * Filter restructuring (Tier 3) entirely when the user lacks the flag.
 * Hidden DOM, NOT disabled — per Tier-3 security pattern.
 */
export function visibleActions(hasTier3: boolean): ActionDefinition[] {
  return hasTier3 ? ALL_ACTIONS : ALL_ACTIONS.filter((a) => a.tier !== 3);
}

export const CATEGORY_LABELS: Record<ActionDefinition['category'], string> = {
  projectLevel: 'Project-level actions',
  portfolioRules: 'Portfolio rules',
  targetSetters: 'Target setters',
  restructuring: 'Restructuring (Tier 3)',
};

export const CATEGORY_DESCRIPTIONS: Record<ActionDefinition['category'], string> = {
  projectLevel: 'Applied to one selected project at a time.',
  portfolioRules: 'Blanket rules applied across the portfolio with optional scoping.',
  targetSetters:
    'Informational gap analysis — show distance to target without auto-adjusting the portfolio.',
  restructuring:
    'Sensitive structural decisions affecting people and capacity. Hidden for users without Tier 3 permission.',
};
