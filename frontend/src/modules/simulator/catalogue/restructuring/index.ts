/**
 * v5 B2 — Restructuring (Tier 3) catalogue actions (4).
 *
 * Each component is a thin wrapper around `ActionForm` bound to the
 * matching `ActionDefinition` from `catalogueDef.ts`. All four carry
 * `tier: 3` and `leverCategory: 'restructuring'`, which:
 *  - excludes them from `visibleActions(false)` (hidden DOM, never
 *    rendered for non-Tier-3 users);
 *  - routes them to `people_action_item` at Promote time
 *    (`backend/services/scenario_promote.py:196`).
 */

export { RemoveRoleAction } from './RemoveRole';
export { ReduceHeadcountAction } from './ReduceHeadcount';
export { RelocateTeamAction } from './RelocateTeam';
export { HireBlockAction } from './HireBlock';
