/**
 * v5 B2 — Scenario workspace page (3-zone shell).
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │ ScenarioHeader                       │
 *   ├──────────┬──────────────────────────┤
 *   │ Sidebar  │ Workspace centre          │
 *   │ (T2/T4)  │  - Surface preselect      │
 *   │          │  - Impact strip (T3)      │
 *   │          │  - Change summary slot    │
 *   └──────────┴──────────────────────────┘
 *
 * The page owns:
 *  - <ScenarioProvider> wraps the entire workspace.
 *  - URL → scenarioId resolution (`/simulator/scenarios/:id`).
 *  - Sandbox border + drawer toggle.
 *  - Slots for surface + impact (T2/T3 deliver via separate routes
 *    under `surface/:surfaceKey/:entityId?`).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { History, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { ScenarioProvider } from '../ScenarioContext';
import { useScenarioContext } from '../useScenarioContext';
import { ADVISOR_ENABLED } from '../flags/advisorFlag';
import { ScenarioHeader } from './header/ScenarioHeader';
import { WorkspaceSidebar } from './sidebar/WorkspaceSidebar';
import { ProjectsSection } from './sidebar/ProjectsSection';
import { BacklogSection } from './sidebar/BacklogSection';
import { PortfolioSettingsSection } from './sidebar/PortfolioSettingsSection';
import { SandboxBorder } from './SandboxBorder';
import { ChangeSummaryDrawer } from '../drawer/ChangeSummaryDrawer';
import {
  ForecastGridSurface,
  CostAllocationSurface,
  BacklogSandboxSurface,
  RateTableSurface,
  ResourceAssignmentSurface,
  MilestonesSurface,
  VendorContractsSurface,
  SourcingMixSurface,
  CapExOpExSurface,
  RunningCostsSurface,
  HierarchyReassignSurface,
  BudgetEnvelopeSurface,
  EscalationFactorsSurface,
  HypotheticalProjectSurface,
  PipelineStageSurface,
  TechNavigatorScoreSurface,
} from '../surfaces';

/**
 * Surface key (from URL `/surface/:surfaceKey/:entityId?`) → component.
 * Tier-3 surfaces (PeopleMaster, CapacityParameters) are added when T4
 * merges. Until then the switch returns `null` for those keys, which
 * matches the spec's hidden-DOM rule for users without Tier 3 access.
 */
function renderSurface(
  surfaceKey: string | undefined,
  entityId: string | undefined,
): React.ReactNode {
  switch (surfaceKey) {
    case 'forecast-grid':
      return <ForecastGridSurface projectId={entityId ?? ''} />;
    case 'cost-allocation':
      return <CostAllocationSurface entityId={entityId ?? ''} />;
    case 'backlog':
      return <BacklogSandboxSurface />;
    case 'rate-table':
      return <RateTableSurface />;
    case 'resource-assignment':
      return <ResourceAssignmentSurface projectId={entityId ?? ''} />;
    case 'milestones':
      return <MilestonesSurface projectId={entityId ?? ''} />;
    case 'vendor-contracts':
      return <VendorContractsSurface projectId={entityId ?? ''} />;
    case 'sourcing-mix':
      return <SourcingMixSurface projectId={entityId ?? ''} />;
    case 'capex-opex':
      return <CapExOpExSurface projectId={entityId ?? ''} />;
    case 'running-costs':
      return <RunningCostsSurface projectId={entityId ?? ''} />;
    case 'hierarchy-reassign':
      return <HierarchyReassignSurface projectId={entityId ?? ''} />;
    case 'budget-envelope':
      return <BudgetEnvelopeSurface />;
    case 'escalation-factors':
      return <EscalationFactorsSurface />;
    case 'hypothetical-project':
      return <HypotheticalProjectSurface />;
    case 'pipeline-stage':
      return <PipelineStageSurface projectId={entityId ?? ''} />;
    case 'tech-navigator-score':
      return <TechNavigatorScoreSurface projectId={entityId ?? ''} />;
    default:
      return null;
  }
}

function ScenarioWorkspaceInner() {
  const ctx = useScenarioContext();
  const params = useParams<{ surfaceKey?: string; entityId?: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  // Lazy-load advisor only when the flag is on.
  const [AdvisorPanel, setAdvisorPanel] = useState<React.ComponentType<{
    onClose: () => void;
  }> | null>(null);
  useEffect(() => {
    if (!ADVISOR_ENABLED) return;
    let cancelled = false;
    void import('../advisor/AdvisorMount').then((mod) => {
      if (!cancelled) {
        setAdvisorPanel(() => mod.AdvisorMount);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ctx.error) {
    return (
      <div className="px-6 py-6">
        <Card className="max-w-md mx-auto mt-12 p-8 text-center">
          <ShieldAlert
            className="h-10 w-10 text-muted-foreground mx-auto mb-3"
            aria-hidden="true"
          />
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Couldn't load scenario
          </h2>
          <p className="text-sm text-muted-foreground">{ctx.error}</p>
        </Card>
      </div>
    );
  }

  if (!ctx.detail) {
    return (
      <div className="px-6 py-6 space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
        <div className="flex gap-3">
          <Skeleton className="h-96 w-64 flex-shrink-0" />
          <Skeleton className="h-96 flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-3">
      <ScenarioHeader
        onOpenAdvisor={ADVISOR_ENABLED ? () => setAdvisorOpen(true) : undefined}
        onOpenPromote={ctx.canPromote ? () => setPromoteOpen(true) : undefined}
      />

      <SandboxBorder>
        <div className="flex gap-3">
          <WorkspaceSidebar
            projectsSection={<ProjectsSection />}
            backlogSection={<BacklogSection />}
            portfolioSettingsSection={<PortfolioSettingsSection />}
          />
          <div className="flex-1 min-w-0 space-y-3">
            {/* Impact strip slot — filled by T3 when their merge lands. */}
            <div
              data-slot="impact-strip"
              className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground italic"
            >
              Impact dashboard — filled by T3 (8 dimensions: financial,
              backlog ranking, capacity, people, outsourcing, investment mix,
              running cost, cost allocation).
            </div>
            {/* Surface slot — switched by URL `surfaceKey` from T2's sidebar nav. */}
            <div data-slot="surface" data-surface-key={params.surfaceKey ?? 'none'}>
              {renderSurface(params.surfaceKey, params.entityId) ?? (
                <div className="rounded border border-dashed border-border p-6 text-xs text-muted-foreground italic">
                  Pick a project, the backlog, or a portfolio setting from the
                  sidebar to load a sandbox surface.
                </div>
              )}
            </div>
          </div>
        </div>
      </SandboxBorder>

      {/* Drawer toggle floating bottom-right */}
      <Button
        variant="default"
        size="sm"
        className="fixed bottom-6 right-6 shadow-lg z-30"
        onClick={() => setDrawerOpen(true)}
      >
        <History className="h-4 w-4 mr-1.5" aria-hidden="true" />
        Change summary
        {ctx.changeSummaryEntries.length > 0 && (
          <span className="ml-2 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary-foreground text-primary text-[10px] font-tabular">
            {ctx.changeSummaryEntries.length}
          </span>
        )}
      </Button>

      <ChangeSummaryDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {ADVISOR_ENABLED && AdvisorPanel && advisorOpen && (
        <AdvisorPanel onClose={() => setAdvisorOpen(false)} />
      )}

      {/* Promote modal slot — T4 owns. T1 just needs the open/close state. */}
      {promoteOpen && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
          onClick={() => setPromoteOpen(false)}
        >
          <Card className="max-w-md p-6 m-4 text-center">
            <p className="text-sm text-foreground mb-2">
              Promote workflow — owned by T4.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              T1 surfaces the entry point; T4's PromoteReviewPage will mount
              here under{' '}
              <code className="text-xs">/simulator/scenarios/:id/promote</code>.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPromoteOpen(false)}
            >
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ScenarioWorkspacePage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scenarioId = Number.parseInt(params.id ?? '', 10);

  useEffect(() => {
    if (!Number.isFinite(scenarioId) || scenarioId <= 0) {
      navigate('/simulator', { replace: true });
    }
  }, [scenarioId, navigate]);

  if (!Number.isFinite(scenarioId) || scenarioId <= 0) return null;

  return (
    <ScenarioProvider scenarioId={scenarioId}>
      <ScenarioWorkspaceInner />
    </ScenarioProvider>
  );
}
