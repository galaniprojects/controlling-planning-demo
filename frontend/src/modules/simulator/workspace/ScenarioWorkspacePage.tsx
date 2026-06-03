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
import { ImpactSummaryStripContainer } from './impact/ImpactSummaryStripContainer';
import {
  ForecastGridSurface,
  CostAllocationSurface,
  BacklogSandboxSurface,
  RateTableSurface,
  RunningCostsSurface,
  HierarchyReassignSurface,
  BudgetEnvelopeSurface,
  EscalationFactorsSurface,
  HypotheticalProjectSurface,
  PipelineStageSurface,
  TechNavigatorScoreSurface,
} from '../surfaces';
import { PeopleMasterSurface } from '../surfaces/PeopleMasterSurface';
import { CapacityParametersSurface } from '../surfaces/CapacityParametersSurface';
import { BulkActionsSection } from './sidebar/BulkActionsSection';
import { ResourcesSection } from './sidebar/ResourcesSection';
import { PromoteEnter } from '../promote/PromoteEnter';

/**
 * Surface key (from URL `/surface/:surfaceKey/:entityId?`) → component.
 * Tier-3 surfaces (PeopleMaster, CapacityParameters) return `null` server-
 * side and frontend-side when the caller lacks Tier 3 — matches the
 * spec's hidden-DOM rule.
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
    case 'people-master':
      return <PeopleMasterSurface />;
    case 'capacity-parameters':
      return <CapacityParametersSurface />;
    default:
      return null;
  }
}

function ScenarioWorkspaceInner() {
  const ctx = useScenarioContext();
  const navigate = useNavigate();
  const params = useParams<{ surfaceKey?: string; entityId?: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);

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
        onOpenPromote={
          ctx.canPromote
            ? () => navigate(`/simulator/scenarios/${ctx.scenarioId}/promote`)
            : undefined
        }
      />

      <SandboxBorder>
        <div className="flex gap-3">
          <WorkspaceSidebar
            projectsSection={<ProjectsSection />}
            backlogSection={<BacklogSection />}
            portfolioSettingsSection={<PortfolioSettingsSection />}
            resourcesSection={<ResourcesSection />}
            bulkActionsSection={<BulkActionsSection />}
          />
          <div className="flex-1 min-w-0 space-y-3">
            {/* Impact strip — T3 [B-ID-01..03]. 8 tiles + cost-allocation
                overlay; click a tile to expand its detail panel below. */}
            <ImpactSummaryStripContainer />
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

      <ChangeSummaryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        promoteSlot={ctx.canPromote ? <PromoteEnter /> : null}
      />

      {ADVISOR_ENABLED && AdvisorPanel && advisorOpen && (
        <AdvisorPanel onClose={() => setAdvisorOpen(false)} />
      )}

      {/* Promote workflow lives at /simulator/scenarios/:id/promote (T4's
          PromoteReviewPage). The Promote button in ScenarioHeader navigates
          there directly. PromoteEnter is also available from the change-summary
          drawer footer (controller-only, hidden DOM otherwise). */}
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
