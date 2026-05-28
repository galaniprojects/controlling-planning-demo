import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { workbenchApi } from '@/api/endpoints';
import type { WorkbenchProjectListItem } from '@/types/api';
import { ProjectListPanel } from './ProjectListPanel';
import { ProjectWorkspace } from './ProjectWorkspace';
import { EntityWorkspace } from './EntityWorkspace';
import { SubmissionDiffView } from './submission/SubmissionDiffView';

export function ProjectWorkbench() {
  const { context, currentRoleId } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  // v5 Wave 5 F7 [E-11]: when `entity=<id>` is present (and no `project`)
  // we render the entity-only workspace for Offerings + InternalServices.
  // Both query params can co-exist when a Project entity is opened from
  // the Run Portfolio (we still prefer `project` in that case).
  const entityIdParam = searchParams.get('entity');
  const projectIdParam = searchParams.get('project');
  const isEntityMode = !!entityIdParam && !projectIdParam;

  const [projects, setProjects] = useState<WorkbenchProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch project list on mount and role change. Skipped in entity mode —
  // the entity workspace owns its own data fetch.
  useEffect(() => {
    if (isEntityMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    workbenchApi
      .getProjects()
      .then((res) => {
        setProjects(res.items);
        // Auto-select from URL param if present
        const preselect = searchParams.get('project');
        if (preselect && res.items.some((p) => p.id === preselect)) {
          setSelectedId(preselect);
        } else if (res.items.length > 0 && !selectedId) {
          setSelectedId(res.items[0].id);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [currentRoleId, isEntityMode]);

  // Handle cross-module deep-link after projects are loaded
  useEffect(() => {
    if (isEntityMode) return;
    const preselect = searchParams.get('project');
    if (preselect && projects.some((p) => p.id === preselect)) {
      setSelectedId(preselect);
    }
  }, [searchParams, projects, isEntityMode]);

  const role = context?.role ?? '';
  const isProjectLead = role === 'project_lead';

  function refreshProjects() {
    workbenchApi
      .getProjects()
      .then((res) => setProjects(res.items))
      .catch(() => setProjects([]));
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Workbench"
        actions={<ModuleGuideButton moduleId="project_workbench" />}
      />


      {isEntityMode && entityIdParam ? (
        // F7 [E-11]: entity-only workspace for Offerings + InternalServices.
        // Project list is hidden because there is no project context.
        <EntityWorkspace entityId={entityIdParam} />
      ) : (
        <div className="flex gap-4 min-h-[calc(100vh-180px)]">
          {/* Left panel — project list */}
          <ProjectListPanel
            projects={projects}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            isProjectLead={isProjectLead}
            onProjectCreated={refreshProjects}
          />

          {/* Right panel — workspace */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {selectedId && searchParams.get('tab') === 'diff' ? (
              <SubmissionDiffView
                projectId={selectedId}
                onBack={() => {
                  setSearchParams({});
                }}
              />
            ) : selectedId ? (
              <ProjectWorkspace
                projectId={selectedId}
                role={role}
                status={projects.find((p) => p.id === selectedId)?.status}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                {loading ? (
                  <div className="space-y-3 w-full max-w-md">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  'Select a project from the list'
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
