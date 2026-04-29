/**
 * PortfolioOverview — Portfolio module shell with Change/Run sub-modules
 * per [E-11] (Cluster F integration).
 *
 * Two pill buttons at the top let the user switch between:
 *
 * - Change Portfolio: DoI 0–4 projects (the existing dashboard + CR
 *   Approvals tab). The v4 "Intake Queue" tab is removed per [A-PS-13] /
 *   A8 acceptance criteria — intake is now part of the backlog flow.
 * - Run Portfolio: DoI 5 projects + offerings + internal services from
 *   Cluster F's chargeable-entities data layer. Single unified entity list
 *   with type filter (Project / Offering / InternalService).
 *
 * The user's last sub-module is persisted in localStorage so subsequent
 * visits land in the same place per [E-11].
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { useRole } from '@/contexts/RoleContext';
import { cn } from '@/lib/utils';
import { DashboardTab } from './dashboard/DashboardTab';
import { ApprovalsTab } from './approvals/ApprovalsTab';
import { RunPortfolioTab } from './run/RunPortfolioTab';

type SubModule = 'change' | 'run';

const SUBMODULE_STORAGE_KEY = 'creta:portfolio:subModule';

function readPersistedSubModule(): SubModule {
  if (typeof window === 'undefined') return 'change';
  const v = window.localStorage.getItem(SUBMODULE_STORAGE_KEY);
  return v === 'run' ? 'run' : 'change';
}

function persistSubModule(value: SubModule) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SUBMODULE_STORAGE_KEY, value);
}

function getTabFromPath(pathname: string): string {
  if (pathname.startsWith('/portfolio/approvals')) return 'approvals';
  return 'dashboard';
}

function getSubModuleFromPath(pathname: string): SubModule | null {
  if (pathname.startsWith('/portfolio/run')) return 'run';
  if (
    pathname === '/portfolio' ||
    pathname.startsWith('/portfolio/dashboard') ||
    pathname.startsWith('/portfolio/approvals')
  ) {
    return 'change';
  }
  return null;
}

export function PortfolioOverview() {
  const location = useLocation();
  const navigate = useNavigate();
  const { context } = useRole();

  const role = context?.role;
  const showApprovals = role === 'controller';

  // Sub-module: hydrated from URL first, then localStorage fallback.
  const [subModule, setSubModule] = useState<SubModule>(() => {
    return getSubModuleFromPath(location.pathname) ?? readPersistedSubModule();
  });

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));

  // v4 intake URL → redirect to backlog (intake retired per [A-PS-13]).
  useEffect(() => {
    if (location.pathname.startsWith('/portfolio/intake')) {
      navigate('/backlog', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Sync sub-module + tab from URL.
  useEffect(() => {
    const urlSub = getSubModuleFromPath(location.pathname);
    if (urlSub && urlSub !== subModule) {
      setSubModule(urlSub);
    }
    const tab = getTabFromPath(location.pathname);
    if (tab !== activeTab) setActiveTab(tab);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to dashboard if current tab is no longer available for this role
  useEffect(() => {
    if (!role) return;
    if (activeTab === 'approvals' && !showApprovals) setActiveTab('dashboard');
  }, [activeTab, role, showApprovals]);

  function handleSubModuleChange(next: SubModule) {
    setSubModule(next);
    persistSubModule(next);
    if (next === 'run') {
      navigate('/portfolio/run', { replace: true });
    } else {
      navigate('/portfolio', { replace: true });
      setActiveTab('dashboard');
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'dashboard') navigate('/portfolio', { replace: true });
    else navigate(`/portfolio/${value}`, { replace: true });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Portfolio Overview</h1>
          <p className="text-xs text-muted-foreground">
            {subModule === 'change'
              ? 'Change Portfolio — projects in transformation (DoI 0–4)'
              : 'Run Portfolio — steady-state entities (DoI 5, offerings, internal services)'}
          </p>
        </div>
        <ModuleGuideButton moduleId="portfolio_overview" />
      </div>

      {/* Sub-module switcher per [E-11] */}
      <div
        role="tablist"
        aria-label="Portfolio sub-module"
        className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5"
      >
        <SubModuleButton
          active={subModule === 'change'}
          onClick={() => handleSubModuleChange('change')}
          label="Change"
          subtitle="DoI 0–4"
        />
        <SubModuleButton
          active={subModule === 'run'}
          onClick={() => handleSubModuleChange('run')}
          label="Run"
          subtitle="DoI 5 / offerings / services"
        />
      </div>

      {subModule === 'change' ? (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            {showApprovals && <TabsTrigger value="approvals">CR Approvals</TabsTrigger>}
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>

          {showApprovals && (
            <TabsContent value="approvals" className="mt-4">
              <ApprovalsTab />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <RunPortfolioTab />
      )}
    </div>
  );
}

function SubModuleButton({
  active,
  onClick,
  label,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  subtitle: string;
}) {
  return (
    <Button
      role="tab"
      aria-selected={active}
      variant="ghost"
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-2 h-auto flex flex-col items-start text-left gap-0',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="text-sm font-medium leading-tight">{label}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-70 leading-tight">
        {subtitle}
      </span>
    </Button>
  );
}
