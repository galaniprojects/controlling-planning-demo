import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { useRole } from '@/contexts/RoleContext';
import { DashboardTab } from './dashboard/DashboardTab';
import { IntakeTab } from './intake/IntakeTab';
import { ApprovalsTab } from './approvals/ApprovalsTab';

function getTabFromPath(pathname: string): string {
  if (pathname.startsWith('/portfolio/intake')) return 'intake';
  if (pathname.startsWith('/portfolio/approvals')) return 'approvals';
  return 'dashboard';
}

export function PortfolioOverview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { context } = useRole();

  const role = context?.role;
  const showIntake = role === 'controller' || role === 'project_lead';
  const showApprovals = role === 'controller';

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));

  // Reset to dashboard if current tab is no longer available for this role
  useEffect(() => {
    if (activeTab === 'intake' && !showIntake) setActiveTab('dashboard');
    if (activeTab === 'approvals' && !showApprovals) setActiveTab('dashboard');
  }, [activeTab, showIntake, showApprovals]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'dashboard') navigate('/portfolio', { replace: true });
    else navigate(`/portfolio/${value}`, { replace: true });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Portfolio Overview</h1>
        <ModuleGuideButton moduleId="portfolio_overview" />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          {showIntake && <TabsTrigger value="intake">Intake Queue</TabsTrigger>}
          {showApprovals && <TabsTrigger value="approvals">Approvals</TabsTrigger>}
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>

        {showIntake && (
          <TabsContent value="intake" className="mt-4">
            <IntakeTab />
          </TabsContent>
        )}

        {showApprovals && (
          <TabsContent value="approvals" className="mt-4">
            <ApprovalsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
