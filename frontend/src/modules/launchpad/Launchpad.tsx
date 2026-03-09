import { useEffect, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { notificationsApi, modulesApi } from '@/api/endpoints';
import type { Notification, ModuleTile } from '@/types/api';
import { NotificationsList } from './NotificationsList';
import { ModuleGrid } from './ModuleGrid';
import { SubmitProjectButton } from './SubmitProjectButton';

export function Launchpad() {
  const { currentRoleId, context } = useRole();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modules, setModules] = useState<ModuleTile[]>([]);

  useEffect(() => {
    notificationsApi.getAll().then((res) => setNotifications(res.items));
    modulesApi.getAll().then((res) => setModules(res.items));
  }, [currentRoleId]);

  const isProjectLead = context?.role === 'project_lead';

  return (
    <div className="px-6 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Launchpad</h1>

      <NotificationsList notifications={notifications} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">Modules</h2>
        {isProjectLead && <SubmitProjectButton />}
      </div>
      <ModuleGrid modules={modules} />
    </div>
  );
}
