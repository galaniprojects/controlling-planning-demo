/**
 * v5 B2 [B-PR-05] — PL Apply-to-forecast permission hook.
 *
 * The Apply-to-forecast button carries a published scenario's diffs
 * forward into the PL's own-project forecast cells, marked provisional
 * per [B-OQ-02]. The backend endpoint is gated to `project_lead` only
 * (`backend/routers/scenarios.py:1068`).
 */

import { useRole } from '@/contexts/RoleContext';

export function useCanApplyToForecast(): boolean {
  const { context } = useRole();
  return context?.role === 'project_lead';
}
