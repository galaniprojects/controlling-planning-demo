/**
 * DefineProjectPage — top-level component for `/define/new` and
 * `/define/:projectId`.
 *
 * Responsibilities:
 *   - Load the canonical Define-page project payload + pipeline state.
 *   - Manage the active tab + DoI overlay deep-link anchor.
 *   - Track per-tab dirty flags so the shell can render pips.
 *   - On `/define/new`, accept the name-only Save → redirect to
 *     `/define/{newId}`.
 *
 * Tab content for Tech Navigator, Financials, and Approval &
 * Milestones is supplied by sibling teammates. Shell-builder renders
 * placeholders for those slots so the page boots end-to-end before
 * the dependent worktrees land.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { pipelineApi } from '@/api/endpoints';
import type { PipelineState } from '@/types/pipeline';
import type { ProjectDefineResponse } from '@/types/define';
import type { DefineTabId } from '@/modules/backlog/components/detail/DoIRequirementsRegistry';
import { DefineShell, TabPlaceholder, type TabDirtyState } from './DefineShell';
import { IdentityTab } from './IdentityTab';
import { TechNavigatorTab } from './TechNavigatorTab';
import { FinancialsTab } from './FinancialsTab';
import { ApprovalMilestonesTab } from './ApprovalMilestonesTab';
import { defineApi } from './api';

const VALID_TABS: DefineTabId[] = [
  'identity',
  'tech_navigator',
  'financials',
  'approval_milestones',
];

const EMPTY_DIRTY: TabDirtyState = {
  identity: false,
  tech_navigator: false,
  financials: false,
  approval_milestones: false,
};

export function DefineProjectPage() {
  const params = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { context, currentRoleId } = useRole();

  // Route param vs "new" sentinel — keep them distinct so the
  // `/define/new` case can render before any DB row exists.
  const projectId =
    params.projectId && params.projectId !== 'new' ? params.projectId : null;

  // Active tab — URL-driven via ?tab= for deep-link / refresh resilience.
  const tabParam = searchParams.get('tab') as DefineTabId | null;
  const activeTab: DefineTabId =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'identity';

  // The DoI overlay's deep-link writes `?anchor=...` into the URL. The
  // child tab honours it directly (no React mirror state needed); we
  // simply clear the URL param after a short delay so refocusing on
  // subsequent renders doesn't keep firing.
  const focusAnchor = searchParams.get('anchor');
  useEffect(() => {
    if (!focusAnchor) return;
    const t = window.setTimeout(() => {
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('anchor');
          return next;
        },
        { replace: true },
      );
    }, 800);
    return () => window.clearTimeout(t);
  }, [focusAnchor, setSearchParams]);

  // Canonical project + pipeline state.
  const [project, setProject] = useState<ProjectDefineResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  // Per-tab dirty flags surfaced via shell pips.
  const [dirty, setDirty] = useState<TabDirtyState>(EMPTY_DIRTY);

  const reloadPipeline = useCallback(async () => {
    if (!projectId) return;
    try {
      const next = await pipelineApi.get(projectId);
      setPipeline(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load DoI state');
    }
  }, [projectId]);

  // Initial load for an existing project; on /define/new this resets
  // back to a clean canvas. The lint rule
  // `react-hooks/set-state-in-effect` is intentionally suspended here
  // because the effect IS the data-sync boundary (loadout / loadin on
  // route changes); deferring via microtask breaks Strict-Mode's
  // double-invoke semantics.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setPipeline(null);
      setLoading(false);
      setError(null);
      setDirty(EMPTY_DIRTY);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setDirty(EMPTY_DIRTY);
    Promise.all([
      defineApi.get(projectId).catch(() => null),
      pipelineApi.get(projectId).catch(() => null),
    ])
      .then(([p, pipe]) => {
        if (!alive) return;
        setProject(p);
        setPipeline(pipe);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message ?? 'Failed to load project');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, currentRoleId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setTabDirty = useCallback(
    (tab: DefineTabId, value: boolean) => {
      setDirty((prev) => (prev[tab] === value ? prev : { ...prev, [tab]: value }));
    },
    [],
  );

  const role = context?.role ?? '';
  // Identity tab editable by controller and the assigned PL. Other
  // personas are read-only here.
  const identityReadOnly = !(role === 'controller' || role === 'project_lead');

  const handleTabChange = useCallback(
    (tab: DefineTabId, anchor?: string) => {
      // The URL is the single source of truth for both the active tab
      // and the focus anchor — child tabs derive their own focus state
      // from the `?anchor=` query param. No mirror React state needed.
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set('tab', tab);
          if (anchor) {
            next.set('anchor', anchor);
          } else {
            next.delete('anchor');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleIdentitySaved = useCallback(
    (response: ProjectDefineResponse) => {
      // On `/define/new` the response carries the newly minted id —
      // route to the canonical URL so further saves go through PUT.
      if (!projectId && response.id) {
        navigate(`/define/${response.id}`, { replace: true });
        return;
      }
      // Existing project — adopt the latest canonical payload and
      // refresh pipeline state.
      setProject(response);
      void reloadPipeline();
    },
    [navigate, projectId, reloadPipeline],
  );

  const projectName =
    project?.name ?? (projectId ? null : 'New project');

  return (
    <DefineShell
      projectId={projectId}
      projectName={projectName}
      pipeline={pipeline}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      dirty={dirty}
      identity={
        loading && projectId ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <IdentityTab
            projectId={projectId}
            initial={project}
            focusAnchor={activeTab === 'identity' ? focusAnchor : null}
            readOnly={identityReadOnly}
            onSaved={handleIdentitySaved}
            onDirtyChange={(d) => setTabDirty('identity', d)}
          />
        )
      }
      techNavigator={
        !projectId ? (
          <TabPlaceholder
            title="Save the project first"
            owner="tabs-builder"
          />
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <TechNavigatorTab
            projectId={projectId}
            readOnly={identityReadOnly}
            onDirtyChange={(d) => setTabDirty('tech_navigator', d)}
          />
        )
      }
      financials={
        !projectId || !project ? (
          <TabPlaceholder
            title="Save the project first"
            owner="tabs-builder"
          />
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <FinancialsTab
            project={project}
            readOnly={identityReadOnly}
            onDirtyChange={(d) => setTabDirty('financials', d)}
            onProjectUpdated={(p) => {
              setProject(p);
              void reloadPipeline();
            }}
          />
        )
      }
      approvalMilestones={
        loading && projectId ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <ApprovalMilestonesTab
            projectId={projectId}
            project={project}
            pipeline={pipeline}
            readOnly={identityReadOnly}
            focusAnchor={activeTab === 'approval_milestones' ? focusAnchor : null}
            onDirtyChange={(d) => setTabDirty('approval_milestones', d)}
            onSaved={(updated) => {
              if (updated) setProject(updated);
              void reloadPipeline();
            }}
          />
        )
      }
    />
  );
}

export default DefineProjectPage;
