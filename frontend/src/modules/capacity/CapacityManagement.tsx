/**
 * CapacityManagement — v5.2 W2 layout shell.
 *
 * Hosts the secondary nav (Workspace / Requests / History) and renders
 * the active sub-route via `<Outlet />`. The previous tabbed layout
 * (My Team / Org Overview) has been retired in favour of a single
 * scope-driven workspace per the v5.2 redesign spec §1.3.
 *
 * Responsibilities now:
 *   - Fetch the role-scoped CapacityContext (used by sub-routes for
 *     pending-request counts, default CC pinning).
 *   - Mount `CapacityScopeProvider` so ScopeBar / KPI bar / Timeline
 *     all share scope state.
 *   - Render module header + `CapacityModuleNav` strip + `<Outlet />`.
 *   - Gate Project Leads out of the workspace (redirected to
 *     `/capacity/availability` by `CapacityWorkspace`).
 *
 * Legacy MyTeam / Org / RequestManagement / ProjectAssignmentPage
 * surfaces are left in repo (unrouted) to be removed in W3–W4 as their
 * replacements land.
 */
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import {
  CapacityScopeProvider,
  defaultScopeForRole,
} from '@/contexts/CapacityScopeContext';
import { capacityApi } from '@/api/endpoints';
import type { CapacityContext } from '@/types/api';
// CapacityModuleNav is owned by Track B (default export). It reads
// the active role from `useRole()` and renders Workspace / Requests /
// History links per spec §12.1.
import CapacityModuleNav from './CapacityModuleNav';

export function CapacityManagement() {
  const { context, currentRoleId } = useRole();
  const role = context?.role;

  const [capContext, setCapContext] = useState<CapacityContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getContext()
      .then(setCapContext)
      .catch(() => setCapContext(null))
      .finally(() => setLoading(false));
  }, [currentRoleId]);

  if (loading) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Project Lead is gated out of the workspace itself; CapacityWorkspace
  // redirects them to /capacity/availability. We still render the shell
  // so /capacity/availability has a layout host.
  return (
    <CapacityScopeProvider
      initialScope={defaultScopeForRole(role)}
      initialCcId={capContext?.managed_cost_center_id ?? null}
    >
      <div className="px-6 py-6 space-y-4">
        <ModuleHeader
          title="Capacity Management"
          actions={<ModuleGuideButton moduleId="capacity_management" />}
        />
        <CapacityModuleNav
          pendingRequestCount={capContext?.pending_request_count ?? 0}
        />
        <Outlet />
      </div>
    </CapacityScopeProvider>
  );
}

export default CapacityManagement;
