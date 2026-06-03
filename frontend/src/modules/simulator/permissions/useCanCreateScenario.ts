/**
 * Simulator Session 4 — Create-scenario permission hook.
 *
 * Per the project-scope redesign (§9), Project Leads are now scenario
 * authors (scoped to projects they lead — the backend enforces this
 * per-action, returning 403 on cross-project edits). Scenario creation is
 * therefore available to controllers, executives, CC owners, AND project
 * leads. The backend admits PLs as authors.
 */

import { useRole } from '@/contexts/RoleContext';

export function useCanCreateScenario(): boolean {
  const { context } = useRole();
  const role = context?.role;
  return (
    role === 'controller' ||
    role === 'executive' ||
    role === 'cost_center_owner' ||
    role === 'project_lead'
  );
}
