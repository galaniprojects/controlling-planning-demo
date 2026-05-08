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
 * If/when a future wave adds person_id to RoleContext, callers can
 * be migrated and this constant retired.
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
