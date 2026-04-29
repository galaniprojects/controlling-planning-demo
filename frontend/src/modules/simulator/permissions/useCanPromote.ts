/**
 * v5 B2 [B-PR-01] [B-OQ-01] — Promote permission hook.
 *
 * Promotion (materialising scenario diffs onto live forecast / canonical
 * Distribution + BTC rows) is controller-only at the role level per
 * `backend/routers/scenarios.py:977` (`require_role("controller")`).
 *
 * Per [F-AC-01], non-controllers may also have explicit
 * `RolePermissionGrant` rows for `btc_profile` / `distribution`, but the
 * frontend gate stays `role === 'controller'` — the backend will reject
 * non-controllers regardless, and the per-action permission is surfaced
 * through the routing preview's `permission_ok` flag.
 */

import { useRole } from '@/contexts/RoleContext';

export function useCanPromote(): boolean {
  const { context } = useRole();
  return context?.role === 'controller';
}
