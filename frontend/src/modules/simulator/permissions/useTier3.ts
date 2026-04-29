/**
 * v5 B2 [B-AC-02] [D-AC-02] — Tier 3 visibility hook.
 *
 * Tier 3 controls visibility of sensitive simulator surfaces (People
 * Master, Capacity Parameters, restructuring catalogue actions) and
 * the People impact dimension. Per [B-AC-02] the flag is independent
 * of role — any of the four personas can be a Tier-3 user — and is
 * resolved server-side from `User.tier3_flag` via `RoleContext.tier3_flag`.
 *
 * Defensive fallback: if the impact response carries `tier3_visible`
 * (set by the backend when redacting Tier 3 data), we honour that as
 * an authoritative override. When both are present, both must agree.
 */

import { useRole } from '@/contexts/RoleContext';

interface Tier3Sources {
  /** Optional override from the impact dashboard response. */
  impactTier3Visible?: boolean | null;
}

export function useTier3(sources: Tier3Sources = {}): boolean {
  const { context } = useRole();
  const ctxFlag = Boolean(context?.tier3_flag);
  // Backend redacts Tier 3 dimensions when caller is non-Tier-3. If
  // an impact response says tier3 is hidden, frontend trusts it even
  // if the role context is stale.
  if (sources.impactTier3Visible === false) return false;
  return ctxFlag;
}
