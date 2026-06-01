/**
 * ProjectWorkbench — Workbench shell.
 *
 * Service Workbench Session 3 rewrite: this is now the canonical home
 * for **all three** ChargeableEntity subtypes (Project / Offering /
 * Internal Service). The URL contract is:
 *
 *   /workbench                              — landing, no selection
 *   /workbench?entity=<chargeable_entity_id>  — canonical
 *   /workbench?project=<project_id>         — legacy alias; resolved to
 *                                             the matching ChargeableEntity
 *                                             on first render and the URL
 *                                             is rewritten to `?entity=…`
 *
 * The sidebar (`EntityListPanel`) lists Projects + Offerings + Internal
 * Services together, with a segmented type filter. The workspace panel
 * dispatches on `entity.entity_type`:
 *
 *   Project          → existing ProjectWorkspace (5 tabs unchanged)
 *   Offering         → ServiceOverviewTab (new 3×3 service tile grid)
 *   InternalService  → ServiceOverviewTab (8 tiles; 3,3 empty)
 *
 * Project Lead filtering on Project rows is preserved — the
 * workbench-projects API is already role-scoped server-side. Offerings
 * and Internal Services are visible to PLs read-only (mirrors the
 * existing read-only Charging surface they already see).
 *
 * The legacy `EntityWorkspace` (a single-tab BTC editor that the Run
 * Portfolio used to deep-link to) is superseded by the service tile
 * grid + its tile 2,2 deep-link.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { chargingApi, workbenchApi } from '@/api/endpoints';
import type {
  ChargeableEntityItem,
  WorkbenchProjectListItem,
} from '@/types/api';
import {
  EntityListPanel,
  buildEntityRows,
  type WorkbenchEntityRow,
} from './EntityListPanel';
import { ProjectWorkspace } from './ProjectWorkspace';
import { ServiceOverviewTab } from './service-overview/ServiceOverviewTab';
import { SubmissionDiffView } from './submission/SubmissionDiffView';

export function ProjectWorkbench() {
  const { context, currentRoleId } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const entityIdParam = searchParams.get('entity');
  const legacyProjectIdParam = searchParams.get('project');

  const [projects, setProjects] = useState<WorkbenchProjectListItem[]>([]);
  const [entities, setEntities] = useState<ChargeableEntityItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Focal entity record for the right-hand workspace. Loaded by id when
  // `?entity=` is present; drives the dispatch on `entity_type`.
  const [focal, setFocal] = useState<ChargeableEntityItem | null>(null);
  const [focalLoading, setFocalLoading] = useState(false);
  const [focalError, setFocalError] = useState<string | null>(null);

  // Resolve legacy `?project=<id>` → `?entity=<chargeable_entity_id>` once
  // on first render. Concurrent attempts are guarded by a ref so React
  // strict-mode double-mount doesn't dispatch two redirect navigations.
  const aliasResolvedRef = useRef(false);
  useEffect(() => {
    if (entityIdParam) return;
    if (!legacyProjectIdParam) return;
    if (aliasResolvedRef.current) return;
    aliasResolvedRef.current = true;
    chargingApi
      .getEntityByProjectId(legacyProjectIdParam)
      .then((ent) => {
        const params = new URLSearchParams(searchParams);
        params.delete('project');
        params.set('entity', ent.id);
        setSearchParams(params, { replace: true });
      })
      .catch(() => {
        // No matching ChargeableEntity (rare — every demo project has
        // one). Strip the stale alias from the URL so the landing state
        // matches what the user sees; otherwise the URL stays stuck on
        // `?project=<unknown_id>` with no diagnostic.
        const params = new URLSearchParams(searchParams);
        params.delete('project');
        setSearchParams(params, { replace: true });
      });
    // We only need this on the first render with the legacy alias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyProjectIdParam, entityIdParam]);

  // Sidebar list — projects (already role-scoped server-side) + all
  // active ChargeableEntities. Refetched whenever the role context
  // changes.
  useEffect(() => {
    setListLoading(true);
    Promise.all([
      workbenchApi.getProjects(),
      chargingApi.listEntities({ is_active: true }),
    ])
      .then(([proj, ents]) => {
        setProjects(proj.items);
        setEntities(ents.items as ChargeableEntityItem[]);
      })
      .catch(() => {
        setProjects([]);
        setEntities([]);
      })
      .finally(() => setListLoading(false));
  }, [currentRoleId]);

  // Focal entity fetch — keyed on the entity id param. Cancelled on
  // unmount or rapid switches.
  useEffect(() => {
    if (!entityIdParam) {
      setFocal(null);
      setFocalError(null);
      setFocalLoading(false);
      return;
    }
    let cancelled = false;
    setFocalLoading(true);
    setFocalError(null);
    chargingApi
      .getEntity(entityIdParam)
      .then((ent) => {
        if (!cancelled) setFocal(ent);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFocalError(e instanceof Error ? e.message : 'Could not load entity');
        setFocal(null);
      })
      .finally(() => {
        if (!cancelled) setFocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityIdParam]);

  const role = context?.role ?? '';
  const isProjectLead = role === 'project_lead';

  const rows = useMemo(
    () => buildEntityRows(projects, entities),
    [projects, entities],
  );

  function handleSelect(row: WorkbenchEntityRow) {
    const params = new URLSearchParams(searchParams);
    params.delete('project');
    params.delete('tab');
    params.set('entity', row.entity_id);
    setSearchParams(params);
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Workbench"
        breadcrumb={focal ? <>Workbench &rsaquo; {focal.name}</> : undefined}
        actions={<ModuleGuideButton moduleId="project_workbench" />}
      />

      <div className="flex gap-4 min-h-[calc(100vh-180px)]">
        <EntityListPanel
          rows={rows}
          loading={listLoading}
          selectedEntityId={entityIdParam}
          onSelect={handleSelect}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          isProjectLead={isProjectLead}
        />

        <div className="flex-1 min-w-0 overflow-hidden">
          <WorkbenchContent
            entityIdParam={entityIdParam}
            focal={focal}
            focalLoading={focalLoading}
            focalError={focalError}
            listLoading={listLoading}
            role={role}
            projects={projects}
            tabParam={searchParams.get('tab')}
            onClearTab={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('tab');
              setSearchParams(params, { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface ContentProps {
  entityIdParam: string | null;
  focal: ChargeableEntityItem | null;
  focalLoading: boolean;
  focalError: string | null;
  listLoading: boolean;
  role: string;
  projects: WorkbenchProjectListItem[];
  tabParam: string | null;
  onClearTab: () => void;
}

function WorkbenchContent({
  entityIdParam,
  focal,
  focalLoading,
  focalError,
  listLoading,
  role,
  projects,
  tabParam,
  onClearTab,
}: ContentProps) {
  // No selection yet — landing state.
  if (!entityIdParam) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        {listLoading ? (
          <div className="space-y-3 w-full max-w-md">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          'Select an entity from the list'
        )}
      </div>
    );
  }

  if (focalLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (focalError || !focal) {
    return (
      <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          Entity unavailable
        </p>
        <p className="text-xs text-red-700 dark:text-red-400 mt-1">
          {focalError ?? 'No chargeable entity matches this id.'}
        </p>
      </div>
    );
  }

  // Project — keep the existing 5-tab workspace + submission diff path.
  if (focal.entity_type === 'Project') {
    if (!focal.project_id) {
      // Pathological — a Project entity without project_id. Should not
      // happen given the schema; if it does, surface a clear error
      // rather than render a half-broken workspace.
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            This Project entity has no linked project record.
          </p>
        </div>
      );
    }
    if (tabParam === 'diff') {
      return (
        <SubmissionDiffView
          projectId={focal.project_id}
          onBack={onClearTab}
        />
      );
    }
    return (
      <ProjectWorkspace
        projectId={focal.project_id}
        role={role}
        status={projects.find((p) => p.id === focal.project_id)?.review_state ?? undefined}
      />
    );
  }

  // Offering or InternalService — service tile grid.
  return <ServiceOverviewTab entity={focal} />;
}
