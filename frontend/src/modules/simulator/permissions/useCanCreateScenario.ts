/**
 * v5 B2 [B-AC-01..03] [E-06c] — Create-scenario permission hook.
 *
 * Per `backend/routers/scenarios.py:217-219`, scenario creation is
 * available to controllers, executives, and CC owners — PL is
 * intentionally excluded; PL only consumes published scenarios via
 * Apply-to-forecast.
 */

import { useRole } from '@/contexts/RoleContext';

export function useCanCreateScenario(): boolean {
  const { context } = useRole();
  const role = context?.role;
  return role === 'controller' || role === 'executive' || role === 'cost_center_owner';
}
