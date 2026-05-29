/**
 * ProjectDetailPage — full-page Portfolio project detail per [E-03a..g].
 *
 * Replaces the Wave-3 slide-in `ProjectSummaryPanel`. Lands on
 * `/portfolio/project/:projectId`. All four tabs are read-only for every
 * role — the editable Workbench remains the canonical authoring surface.
 *
 * Tabs:
 *   1. Overview — project metadata, RAG, timeline, three-point summary.
 *   2. Financial Detail — three-point grid + read-only mixed-granularity
 *      forecast grid + forecast trajectory chart. T2's E4 variance
 *      waterfall slots in via the optional `VarianceWaterfallChart`
 *      import once that component is merged into `main`.
 *   3. Resources & Costs — resource plan summary + external cost summary
 *      (uses E5's `ExternalCostsTab` in read-only mode once that lands
 *      on this branch — see commit ordering in PROGRESS.md).
 *   4. History — forecast version history (C2 `VersionHistoryPanel`) +
 *      change-request history (`CRHistoryList`).
 *
 * The back button restores the Dashboard's scroll position and active
 * filters via a sessionStorage handshake (`scrollY` + `filters`). The
 * dashboard side writes the snapshot on click, this page reads + restores.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { portfolioApi, workbenchApi } from '@/api/endpoints';
import { navigateToWorkbenchByProject } from '@/lib/workbenchNavigation';
import { ragBgColor } from '@/lib/rag';
import { cn } from '@/lib/utils';
import type {
  ProjectOverview,
  ProjectSummary,
} from '@/types/api';
import { OverviewSection } from './sections/OverviewSection';
import { FinancialDetailSection } from './sections/FinancialDetailSection';
import { ResourcesAndCostsSection } from './sections/ResourcesAndCostsSection';
import { HistorySection } from './sections/HistorySection';

const SCROLL_RESTORE_KEY = 'viper:portfolio:dashboard:scroll';

interface BreadcrumbCrumb {
  label: string;
  type: string;
}

function buildBreadcrumbs(
  hierarchyPath: { type_name: string; entity_name: string }[] | undefined,
  projectName: string,
): BreadcrumbCrumb[] {
  const crumbs: BreadcrumbCrumb[] = [{ label: 'Portfolio', type: 'root' }];
  if (hierarchyPath) {
    for (const node of hierarchyPath) {
      crumbs.push({ label: node.entity_name, type: node.type_name });
    }
  }
  crumbs.push({ label: projectName, type: 'project' });
  return crumbs;
}

export function ProjectDetailPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'financial' | 'resources' | 'history'
  >('overview');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      portfolioApi.getProjectSummary(projectId),
      workbenchApi.getOverview(projectId),
    ])
      .then(([s, o]) => {
        if (cancelled) return;
        setSummary(s);
        setOverview(o);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load project');
        setSummary(null);
        setOverview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function handleBack() {
    // Navigate back to the dashboard. The DashboardTab reads
    // sessionStorage[SCROLL_RESTORE_KEY] on mount and re-applies the
    // captured scroll + filters per [E-03b].
    navigate('/portfolio');
  }

  if (!projectId) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">No project id provided.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-4 min-w-0">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <ProjectBreadcrumb
            crumbs={buildBreadcrumbs(
              overview?.metadata.hierarchy_path,
              summary?.name ?? overview?.metadata.name ?? '...',
            )}
            onCrumbClick={(c) => {
              if (c.type === 'root') navigate('/portfolio');
            }}
          />
        </div>
        <ModuleGuideButton moduleId="portfolio_overview" />
      </div>

      {/* Hero card */}
      <Card className="px-5 py-4 space-y-2">
        {loading ? (
          <Skeleton className="h-12 w-2/3" />
        ) : error ? (
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        ) : summary ? (
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-foreground truncate">
                  {summary.name}
                </h1>
                {summary.rag && (
                  <Badge className={cn('text-xs capitalize', ragBgColor(summary.rag))}>
                    {summary.rag}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[11px]">
                  Read-only · open Workbench to edit
                </Badge>
              </div>
              {overview?.metadata.pl_name && (
                <p className="text-xs text-muted-foreground">
                  Project Lead: {overview.metadata.pl_name}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (projectId) navigateToWorkbenchByProject(projectId, navigate);
              }}
            >
              Open in Workbench
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Tab strip */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financial">Financial Detail</TabsTrigger>
          <TabsTrigger value="resources">Resources &amp; Costs</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 min-w-0">
          <OverviewSection
            projectId={projectId}
            summary={summary}
            overview={overview}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="financial" className="mt-4 min-w-0">
          <FinancialDetailSection
            projectId={projectId}
            overview={overview}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="resources" className="mt-4 min-w-0">
          <ResourcesAndCostsSection
            projectId={projectId}
            summary={summary}
            overview={overview}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4 min-w-0">
          <HistorySection projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ProjectBreadcrumbProps {
  crumbs: BreadcrumbCrumb[];
  onCrumbClick?: (crumb: BreadcrumbCrumb) => void;
}

function ProjectBreadcrumb({ crumbs, onCrumbClick }: ProjectBreadcrumbProps) {
  return (
    <nav
      className="flex items-center gap-1.5 flex-wrap min-w-0"
      aria-label="Project hierarchy"
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${c.type}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            {isLast ? (
              <span className="text-sm font-medium text-foreground truncate">
                {c.label}
              </span>
            ) : (
              <button
                onClick={() => onCrumbClick?.(c)}
                className="text-sm text-muted-foreground hover:text-primary truncate"
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// Helper exposed to siblings: write the dashboard scroll/filter snapshot
// before navigating. Imported by `DashboardTab` so the back button can
// restore the user's previous viewport per [E-03b].
export function captureDashboardSnapshot(filters: Record<string, string>) {
  try {
    const payload = {
      scrollY: window.scrollY,
      filters,
      capturedAt: Date.now(),
    };
    sessionStorage.setItem(SCROLL_RESTORE_KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable — fall back gracefully */
  }
}

export function readDashboardSnapshot(): {
  scrollY: number;
  filters: Record<string, string>;
} | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      scrollY: number;
      filters: Record<string, string>;
      capturedAt: number;
    };
    // Ignore stale snapshots older than 30 minutes
    if (Date.now() - parsed.capturedAt > 30 * 60 * 1000) return null;
    return { scrollY: parsed.scrollY, filters: parsed.filters };
  } catch {
    return null;
  }
}

export function clearDashboardSnapshot() {
  try {
    sessionStorage.removeItem(SCROLL_RESTORE_KEY);
  } catch {
    /* ignore */
  }
}
