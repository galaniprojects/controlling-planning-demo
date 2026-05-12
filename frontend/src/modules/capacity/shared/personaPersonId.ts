/**
 * Demo persona → person_id mapping.
 *
 * The audit-history endpoint stores `acting_user_id` as a
 * `person_id` (e.g., `p-brenner`), but `RoleContext.context` only
 * exposes `role` and `managed_cost_center_id` — not `person_id`.
 * Demo personas are pinned in `backend/seed/seed.sql`, so a small
 * static map is adequate for resolving "current user's actions"
 * defaults in the History filter (§12.12) and the inbox's
 * Recently-Completed section (§12.8).
 *
 * v5.2 W6 Track C decision (W3 polish-backlog item):
 *   Keep this static map rather than threading `person_id` through
 *   `CurrentUser` / `RoleContext`. Rationale:
 *     - Personas are demo-only fixtures pinned by seed.sql; they
 *       don't change at runtime.
 *     - Adding `person_id` to `RoleContext` requires backend changes
 *       to `/api/role/context` (`CurrentUserSchema`) and a frontend
 *       schema update — out of scope for a polish item.
 *     - The map has a single canonical source (this file); keeping
 *       it co-located with capacity callers keeps the indirection
 *       cheap.
 *   If/when a future wave adds `person_id` to `RoleContext`, callers
 *   can be migrated and this constant retired.
 */
export const PERSONA_TO_PERSON_ID: Record<string, string> = {
  'persona-controller': 'p-meier',
  'persona-cc-owner': 'p-brenner',
  'persona-pl': 'p-sharma',
  'persona-exec': 'p-weber',
};

export function resolvePersonaPersonId(
  currentRoleId: string | null | undefined,
): string | undefined {
  if (!currentRoleId) return undefined;
  return PERSONA_TO_PERSON_ID[currentRoleId];
}
