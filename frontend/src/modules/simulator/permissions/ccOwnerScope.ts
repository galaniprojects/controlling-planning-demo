/**
 * v5 B2 [E-06b] — CC Owner scope helpers.
 *
 * CC Owner scenarios are constrained to the persona's managed cost
 * centre. The backend enforces this on create/apply (`scenarios.py:243-248,551-558`),
 * but the frontend should also filter the lever / project pickers so
 * a CC Owner only sees options they're permitted to act on.
 */

export interface CcOwnerScopeContext {
  /** Caller's persona role. */
  role: string | undefined;
  /** Cost centre id the persona manages (null if not a CC Owner). */
  managedCostCenterId: string | null | undefined;
  /** Optional explicit scope override (e.g. from scenario.cc_owner_scope_cc_id). */
  scenarioScopeCcId?: string | null;
}

/** Effective scope CC for a CC Owner — explicit scenario scope wins, falls back to managed CC. */
export function effectiveCcScope(ctx: CcOwnerScopeContext): string | null {
  if (ctx.role !== 'cost_center_owner') return null;
  return ctx.scenarioScopeCcId ?? ctx.managedCostCenterId ?? null;
}

/**
 * Filter project candidates by the CC Owner's scope. Pass-through for
 * non-CC-Owner roles. Each project must expose `cost_center_id` (the
 * project's owning CC) for the filter to work.
 */
export function filterProjectsForCcOwner<T extends { cost_center_id?: string | null }>(
  projects: T[],
  ctx: CcOwnerScopeContext,
): T[] {
  const scope = effectiveCcScope(ctx);
  if (!scope) return projects;
  return projects.filter((p) => p.cost_center_id === scope);
}

/**
 * Filter catalogue / surface entries based on CC Owner scope. Per
 * `backend/routers/scenarios.py:551-558`, CC Owner scenarios may only
 * modify `change_allocation` actions, so the catalogue should hide all
 * other categories for that role.
 *
 * Levers carry an optional `lever_category`; we whitelist a small set
 * for CC Owners.
 */
export function filterLeversForCcOwner<
  T extends { lever_category?: string | null; action_type?: string | null },
>(levers: T[], ctx: CcOwnerScopeContext): T[] {
  if (ctx.role !== 'cost_center_owner') return levers;
  const allowedCategories = new Set(['people']);
  const allowedActionTypes = new Set(['change_allocation']);
  return levers.filter((l) => {
    if (l.action_type && allowedActionTypes.has(l.action_type)) return true;
    if (l.lever_category && allowedCategories.has(l.lever_category)) return true;
    return false;
  });
}
