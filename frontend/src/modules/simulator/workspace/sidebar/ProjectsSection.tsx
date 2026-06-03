/**
 * v5 B2 — ProjectsSection: project picker for the workspace sidebar.
 *
 * Lists ALL active projects selectable in the simulator (portfolio-wide
 * what-if), so any project the scenario edits — including backlog-stage ones —
 * is reachable. Each row is a button that navigates to a project-scoped surface
 * (Forecast Grid by default; the surface key is read from URL state to preserve
 * the user's last view).
 *
 * Data source: `scenariosApi.getScenarioProjects(scenarioId)` — the scenario-
 * scoped all-active endpoint. (The Portfolio `getProjects()` was wrong here: it
 * applies the 'Change' population filter, which drops backlog-stage projects.)
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Folder, Lock, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { useRole } from '@/contexts/RoleContext';
import { scenariosApi, type ScenarioProjectItem } from '../../api/scenariosApi';
import { useScenarioContext } from '../../useScenarioContext';

const SURFACE_FALLBACK = 'forecast-grid';

export function ProjectsSection() {
  const { scenarioId } = useScenarioContext();
  const { context } = useRole();
  const navigate = useNavigate();
  const params = useParams<{ id: string; surfaceKey?: string }>();

  // Simulator S4 — a PL authors only against projects they lead. The
  // backend enforces this per-action (403 on cross-project edits); the
  // picker greys out projects outside the PL's own set so the scope is
  // obvious before they click in.
  const isProjectLead = context?.role === 'project_lead';
  const ownedProjectIds = useMemo(
    () => new Set(context?.owned_project_ids ?? []),
    [context?.owned_project_ids],
  );
  const isEditable = (projectId: string) =>
    !isProjectLead || ownedProjectIds.has(projectId);
  const [projects, setProjects] = useState<ScenarioProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    scenariosApi
      .getScenarioProjects(scenarioId)
      .then((res) => {
        if (cancelled) return;
        setProjects(res.items);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message ?? 'Failed to load projects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (lower) {
        const blob = `${p.name} ${p.id}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [projects, search]);

  const navigateToProject = (projectId: string) => {
    const surface = params.surfaceKey ?? SURFACE_FALLBACK;
    navigate(`/simulator/scenarios/${params.id}/surface/${surface}/${projectId}`);
  };

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (error) {
    return (
      <p className="text-xs text-red-700 dark:text-red-400 py-2">{error}</p>
    );
  }
  if (projects.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        No projects in scope.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-7 pl-7 text-xs"
        />
      </div>
      <ul className="max-h-[320px] overflow-y-auto space-y-0.5">
        {filtered.slice(0, 200).map((p) => {
          const editable = isEditable(p.id);
          return (
            <li key={p.id}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-7 text-xs disabled:opacity-50"
                onClick={() => navigateToProject(p.id)}
                disabled={!editable}
                title={
                  editable
                    ? undefined
                    : 'You can only edit projects you lead. This project is outside your scope.'
                }
              >
                {editable ? (
                  <Folder className="h-3 w-3 mr-1.5 text-muted-foreground" />
                ) : (
                  <Lock className="h-3 w-3 mr-1.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="truncate">{p.name}</span>
              </Button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="text-[11px] text-muted-foreground italic py-2 px-2">
            No matches.
          </li>
        )}
        {filtered.length > 200 && (
          <li className="text-[11px] text-muted-foreground py-1 px-2">
            +{filtered.length - 200} more — refine search
          </li>
        )}
      </ul>
    </div>
  );
}
