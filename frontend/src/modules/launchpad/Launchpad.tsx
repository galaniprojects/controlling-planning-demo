import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { modulesApi, launchpadApi } from '@/api/endpoints';
import type { ModuleTile, PendingAction } from '@/types/api';
import { LaunchpadHeader } from './LaunchpadHeader';
import { ModuleTilesGrid } from './ModuleTilesGrid';
import { PendingActionsPanel } from './PendingActionsPanel';

export function Launchpad() {
  const { currentRoleId, context } = useRole();
  const [modules, setModules] = useState<ModuleTile[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);

  useEffect(() => {
    modulesApi.getAll().then((res) => setModules(res.items));

    setActionsLoading(true);
    launchpadApi
      .getPendingActions()
      .then((res) => setActions(res.items))
      .catch(() => setActions([]))
      .finally(() => setActionsLoading(false));
  }, [currentRoleId]);

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Zone 1: CRETA Branding + Greeting */}
      <LaunchpadHeader
        userName={context?.user_name || ''}
        role={context?.role || ''}
      />

      {/* Zone 2 + Zone 3 side by side */}
      <div className="flex gap-6">
        {/* Zone 2: Module Tiles */}
        <div className="flex-1">
          <ModuleTilesGrid modules={modules} />
        </div>

        {/* Zone 3: Pending Actions */}
        <div className="w-[280px] shrink-0">
          <PendingActionsPanel actions={actions} loading={actionsLoading} />
        </div>
      </div>
    </div>
  );
}
