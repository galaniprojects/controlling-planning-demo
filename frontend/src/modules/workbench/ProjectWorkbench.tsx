import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { workbenchApi } from '@/api/endpoints';
import type { WorkbenchProjectListItem } from '@/types/api';
import { ProjectListPanel } from './ProjectListPanel';
import { ProjectWorkspace } from './ProjectWorkspace';
import { SubmissionDiffView } from './submission/SubmissionDiffView';

export function ProjectWorkbench() {
  const { context, currentRoleId } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<WorkbenchProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch project list on mount and role change
  useEffect(() => {
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
  }, [currentRoleId]);

  // Handle cross-module deep-link after projects are loaded
  useEffect(() => {
    const preselect = searchParams.get('project');
    if (preselect && projects.some((p) => p.id === preselect)) {
      setSelectedId(preselect);
    }
  }, [searchParams, projects]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">
          Project Workbench
        </h1>
        <ModuleGuideButton moduleId="project_workbench" />
      </div>

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
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
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
    </div>
  );
}
