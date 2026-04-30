import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { launchpadApi } from '@/api/endpoints';
import type { PendingAction } from '@/types/api';
import { LaunchpadHeader } from './LaunchpadHeader';
import { PendingActionsPanel } from './PendingActionsPanel';
import { RoleTileGrid } from './RoleTileGrid';

/**
 * v5 E7 [E-06d-j] — Three-zone Launchpad.
 *
 *   Zone 1: LaunchpadHeader — greeting, role badge, date + forecast cycle
 *   Zone 2: PendingActionsPanel — horizontal scrollable strip (was vertical)
 *   Zone 3: RoleTileGrid — role-personalised KPI tile grid (was modules)
 *
 * Zones 2 and 3 are full-width below the header. Tile grid layout is
 * delegated to per-role components (PL/Controller/CC Owner/Executive).
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

      {/* Zone 3: Role-personalised tile grid (full-width) */}
      <RoleTileGrid />
    </div>
  );
}
