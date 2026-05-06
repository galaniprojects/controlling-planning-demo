import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { launchpadApi } from '@/api/endpoints';
import type { PendingAction } from '@/types/api';
import { LaunchpadHeader } from './LaunchpadHeader';
import { PendingActionsPanel } from './PendingActionsPanel';
import { ModuleCardGrid } from './ModuleCardGrid';

/**
 * v5.1 W6 [C-01] — Three-zone Launchpad.
 *
 *   Zone 1: LaunchpadHeader — greeting, role badge, date + forecast cycle
 *   Zone 2: PendingActionsPanel — horizontal scrollable strip
 *   Zone 3: ModuleCardGrid — fixed 3-column module-launch card grid
 *           (was the role-personalised KPI tile grid before v5.1 W6 [C-01])
 *
 * Zones 2 and 3 are full-width below the header.
 */
export function Launchpad() {
  const { currentRoleId, context } = useRole();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);

  useEffect(() => {
    setActionsLoading(true);
    launchpadApi
      .getPendingActions()
      .then((res) => setActions(res.items))
      .catch(() => setActions([]))
      .finally(() => setActionsLoading(false));
  }, [currentRoleId]);

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      {/* Zone 1: Branding + Greeting + Status row */}
      <LaunchpadHeader
        userName={context?.user_name || ''}
        role={context?.role || ''}
      />

      {/* Zone 2: Pending Actions (horizontal strip, full-width) */}
      <PendingActionsPanel actions={actions} loading={actionsLoading} />

      {/* Zone 3: Module-launch card grid (full-width, fixed 3 columns) */}
      <ModuleCardGrid />
    </div>
  );
}
