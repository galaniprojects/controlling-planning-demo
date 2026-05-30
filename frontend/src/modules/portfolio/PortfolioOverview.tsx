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

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Repeat } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { useRole } from '@/contexts/RoleContext';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import { portfolioApi } from '@/api/endpoints';
import type { PortfolioKPIs } from '@/types/api';
import { DashboardTab } from './dashboard/DashboardTab';
import { ApprovalsTab } from './approvals/ApprovalsTab';
import { RunPortfolioTab } from './run/RunPortfolioTab';
import { RunCostDistributionsTab } from './run/RunCostDistributionsTab';
// === v5 Wave 5 E5 — Portfolio external spend tab [E-08c..d] ===
import { ExternalSpendTab } from './external-spend/ExternalSpendTab';

type SubModule = 'change' | 'run';

const SUBMODULE_STORAGE_KEY = 'viper:portfolio:subModule';
// VIPER W5 §10 — persist the last-used Run contextual tab so a fresh visit
// (or sub-module toggle) lands the user back where they left off.
const RUN_TAB_STORAGE_KEY = 'viper:portfolio:run:tab';

type RunTab = 'dashboard' | 'external-spend' | 'cost-distributions';

function readPersistedSubModule(): SubModule {
  if (typeof window === 'undefined') return 'change';
  const v = window.localStorage.getItem(SUBMODULE_STORAGE_KEY);
  return v === 'run' ? 'run' : 'change';
}

function persistSubModule(value: SubModule) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SUBMODULE_STORAGE_KEY, value);
}

function readPersistedRunTab(): RunTab {
  if (typeof window === 'undefined') return 'dashboard';
  const v = window.localStorage.getItem(RUN_TAB_STORAGE_KEY);
  return v === 'external-spend' || v === 'cost-distributions'
    ? v
    : 'dashboard';
}

function persistRunTab(value: RunTab) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RUN_TAB_STORAGE_KEY, value);
}

function runTabPath(tab: RunTab): string {
  return tab === 'dashboard' ? '/portfolio/run' : `/portfolio/run/${tab}`;
}

function getTabFromPath(pathname: string): string {
  // Run sub-module contextual tabs (VIPER W5 §10).
  if (pathname.startsWith('/portfolio/run/external-spend')) {
    return 'external-spend';
  }
  if (pathname.startsWith('/portfolio/run/cost-distributions')) {
    return 'cost-distributions';
  }
  if (pathname.startsWith('/portfolio/run')) return 'dashboard';
  // Change sub-module tabs.
  if (pathname.startsWith('/portfolio/approvals')) return 'approvals';
  if (pathname.startsWith('/portfolio/external-spend')) return 'external-spend';
  return 'dashboard';
}

function getSubModuleFromPath(pathname: string): SubModule | null {
  if (pathname.startsWith('/portfolio/run')) return 'run';
  if (
    pathname === '/portfolio' ||
    pathname.startsWith('/portfolio/dashboard') ||
    pathname.startsWith('/portfolio/approvals') ||
    pathname.startsWith('/portfolio/external-spend')
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

  // VIPER W4 §9.2 — the segmented selector shows live per-panel metrics, so
  // the portfolio-wide KPIs are fetched once at the shell level, unconditionally
  // on mount (the selector is always visible regardless of active sub-module).
  const [kpis, setKpis] = useState<PortfolioKPIs | null>(null);
  useEffect(() => {
    let cancelled = false;
    portfolioApi
      .getKPIs()
      .then((data) => {
        if (!cancelled) setKpis(data);
      })
      .catch(() => {
        // Selector degrades gracefully to name-only when KPIs are unavailable.
        if (!cancelled) setKpis(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMetric =
    kpis == null
      ? null
      : `${kpis.active_project_count ?? 0} projects · ${formatCurrency(
          kpis.current_forecast ?? 0,
        )} forecast`;
  const runMetric =
    kpis == null
      ? null
      : `${kpis.run?.entity_count ?? 0} entities · ${formatCurrency(
          kpis.run?.annual_cost_total ?? 0,
        )} annual cost`;

  // Derive sub-module + active tab DIRECTLY from the URL on every render so
  // the rendered Tabs content is always in sync with the location pathname.
  // Falling back to localStorage only when the URL itself does not pin a
  // sub-module. This eliminates the brief window where DashboardTab could
  // mount under a `/portfolio/external-spend` URL and (via its legacy
  // `/portfolio/<projectId>` redirect) misinterpret the segment as a project
  // id — which surfaced as the A-04 "Project not found" crash on the back
  // button from the External Spend tab.
  const subModule: SubModule =
    getSubModuleFromPath(location.pathname) ?? readPersistedSubModule();
  const urlTab = getTabFromPath(location.pathname);
  // Hide the approvals tab from non-controllers — falls back to dashboard
  // when the URL pins approvals but the role doesn't allow it.
  const activeTab =
    urlTab === 'approvals' && !showApprovals ? 'dashboard' : urlTab;

  // v4 intake URL → redirect to backlog (intake retired per [A-PS-13]).
  useEffect(() => {
    if (location.pathname.startsWith('/portfolio/intake')) {
      navigate('/backlog', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Persist whichever sub-module the URL is currently pinning so a fresh
  // visit without a deep-link lands on the user's last sub-module. When the
  // URL pins a Run tab, also persist that tab.
  useEffect(() => {
    const urlSub = getSubModuleFromPath(location.pathname);
    if (urlSub) persistSubModule(urlSub);
    if (urlSub === 'run') {
      persistRunTab(getTabFromPath(location.pathname) as RunTab);
    }
  }, [location.pathname]);

  // Reset the active Run tab to the Dashboard on a GENUINE role change (the
  // controlled-value + reset-on-role pattern per CLAUDE.md). Guarded by a
  // previous-role ref so the initial mount (role resolving undefined→defined)
  // does NOT fire — otherwise a hard load / refresh of a Run sub-path would be
  // bounced back to the Dashboard before its tab could initialise from the
  // URL. Only acts while the Run sub-module is the active surface so a
  // Change-portfolio user is never yanked across sub-modules.
  const prevRoleRef = useRef(role);
  useEffect(() => {
    const prevRole = prevRoleRef.current;
    prevRoleRef.current = role;
    const isGenuineChange =
      prevRole !== undefined && role !== undefined && prevRole !== role;
    if (isGenuineChange && getSubModuleFromPath(location.pathname) === 'run') {
      persistRunTab('dashboard');
      navigate('/portfolio/run', { replace: true });
    }
    // Intentionally keyed on role only — pathname is read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  function handleSubModuleChange(next: SubModule) {
    persistSubModule(next);
    if (next === 'run') {
      // Land on the user's last-used Run tab.
      navigate(runTabPath(readPersistedRunTab()), { replace: true });
    } else {
      navigate('/portfolio', { replace: true });
    }
  }

  const handleTabChange = (value: string) => {
    if (subModule === 'run') {
      persistRunTab(value as RunTab);
      navigate(runTabPath(value as RunTab), { replace: true });
      return;
    }
    if (value === 'dashboard') navigate('/portfolio', { replace: true });
    else navigate(`/portfolio/${value}`, { replace: true });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Portfolio Overview"
        subtitle={
          subModule === 'change'
            ? 'Change Portfolio — projects in transformation (DoI 0–4)'
            : 'Run Portfolio — steady-state entities (DoI 5, offerings, internal services)'
        }
        actions={<ModuleGuideButton moduleId="portfolio_overview" />}
      />

      {/* Sub-module switcher per [E-11] / VIPER W4 §9.2 — full-width segmented
          bar with a live metric line per panel. These panels navigate between
          the Change and Run routes, so this is a navigation group (aria-current)
          rather than a tablist (the Change content has its own real <Tabs>). */}
      <div
        role="group"
        aria-label="Portfolio sub-module"
        className="flex gap-3"
      >
        <SubModulePanel
          active={subModule === 'change'}
          onClick={() => handleSubModuleChange('change')}
          icon={<ArrowRightLeft className="h-4 w-4" />}
          iconClassName="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
          label="Change"
          metric={changeMetric}
        />
        <SubModulePanel
          active={subModule === 'run'}
          onClick={() => handleSubModuleChange('run')}
          icon={<Repeat className="h-4 w-4" />}
          iconClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          label="Run"
          metric={runMetric}
        />
      </div>

      {subModule === 'change' ? (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            {showApprovals && <TabsTrigger value="approvals">CR Approvals</TabsTrigger>}
            {/* E5: external spend tab visible to all roles in the Change sub-module */}
            <TabsTrigger value="external-spend">External Spend</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>

          {showApprovals && (
            <TabsContent value="approvals" className="mt-4">
              <ApprovalsTab />
            </TabsContent>
          )}

          <TabsContent value="external-spend" className="mt-4">
            <ExternalSpendTab />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="external-spend">External Spend</TabsTrigger>
            <TabsTrigger value="cost-distributions">
              Cost Distributions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <RunPortfolioTab />
          </TabsContent>

          <TabsContent value="external-spend" className="mt-4">
            <ExternalSpendTab scope="run" />
          </TabsContent>

          <TabsContent value="cost-distributions" className="mt-4">
            <RunCostDistributionsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SubModulePanel({
  active,
  onClick,
  icon,
  iconClassName,
  label,
  metric,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  metric: string | null;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors',
        active
          ? 'border-2 border-primary bg-primary/10 text-foreground'
          : 'border border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:shadow-sm',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          iconClassName,
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            'text-base font-medium leading-tight',
            active ? 'text-foreground' : 'text-foreground/90',
          )}
        >
          {label}
        </span>
        <span className="text-[13px] leading-tight text-muted-foreground">
          {metric ?? ' '}
        </span>
      </span>
    </button>
  );
}
