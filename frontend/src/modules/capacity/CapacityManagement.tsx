import { useState, useEffect } from 'react';
// TODO (v2 Session 2): Handle ?person= query param for notification deep-links
//   — auto-select person in heatmap and open drill-down drawer
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { capacityApi, referenceApi } from '@/api/endpoints';
import type { CapacityContext } from '@/types/api';
import { MyTeamTab } from './myteam/MyTeamTab';
import { OrgOverviewTab } from './org/OrgOverviewTab';
import { RequestManagement } from './requests/RequestManagement';
import { ProjectAssignmentPage } from './requests/ProjectAssignmentPage';

function CapacityTabs({
  capContext,
}: {
  capContext: CapacityContext;
}) {
  const { context } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const role = context?.role;

  // CC selector for controller on My Team tab
  const [ccOptions, setCcOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedCcId, setSelectedCcId] = useState<string>(capContext.managed_cost_center_id ?? '');

  const isController = role === 'controller';
  const isExec = role === 'executive';

  // Init tab from context default
  const [activeTab, setActiveTab] = useState(capContext.default_tab);

  // Reset tab if role changes
  useEffect(() => {
    setActiveTab(capContext.default_tab);
  }, [capContext.default_tab]);

  // Fetch CC list for controller's My Team tab
  useEffect(() => {
    if (isController && ccOptions.length === 0) {
      capacityApi
        .getOrgHeatmap('cost_center')
        .then((res) => {
          const opts = res.items.map((r) => ({ id: r.id, name: r.name }));
          setCcOptions(opts);
          if (!selectedCcId && opts.length > 0) setSelectedCcId(opts[0].id);
        })
        .catch(() => {});
    }
  }, [isController]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate('/capacity', { replace: true });
  };

  // For CC Owner and Exec reading My Team with their own CC
  const effectiveCcId = capContext.managed_cost_center_id ?? selectedCcId;

  // Hide Resource Requests for exec
  const showRequestsButton = !isExec;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="my-team">My Team</TabsTrigger>
        <TabsTrigger value="org">Organization Overview</TabsTrigger>
      </TabsList>

      <TabsContent value="my-team" className="mt-4">
        {/* Controller needs a CC selector */}
        {isController && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Select Cost Center
            </label>
            <Select value={selectedCcId} onValueChange={setSelectedCcId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Choose a cost center" />
              </SelectTrigger>
              <SelectContent>
                {ccOptions.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {effectiveCcId ? (
          <MyTeamTab ccId={effectiveCcId} showRequestsButton={showRequestsButton} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a cost center to view team details.</p>
        )}
      </TabsContent>

      <TabsContent value="org" className="mt-4">
        <OrgOverviewTab />
      </TabsContent>
    </Tabs>
  );
}

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

  // PL has no access
  if (!loading && role === 'project_lead') {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">
          Capacity Management is not available for the Project Lead role.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!capContext) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">Failed to load capacity context.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Capacity Management</h1>
        <ModuleGuideButton moduleId="capacity_management" />
      </div>

      <Routes>
        <Route index element={<CapacityTabs capContext={capContext} />} />
        <Route
          path="requests"
          element={
            <RequestManagement ccId={capContext.managed_cost_center_id ?? ''} />
          }
        />
        <Route
          path="project-assignment/:projectId"
          element={<ProjectAssignmentPage />}
        />
      </Routes>
    </div>
  );
}
