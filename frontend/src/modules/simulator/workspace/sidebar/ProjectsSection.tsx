/**
 * v5 B2 — ProjectsSection: project picker for the workspace sidebar.
 *
 * Lists active projects (filtered by `ccOwnerScopeCcId` when the scenario
 * was authored by a CC Owner per [B-AC-02]). Each row is a button that
 * navigates to a project-scoped surface (Forecast Grid by default; the
 * surface key is read from URL state to preserve the user's last view).
 *
 * Data source: `portfolioApi.getProjects()` — keeps state local; Wave-3
 * lesson: don't add another global cache when a sidebar fetch is fine.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Folder, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { portfolioApi } from '@/api/endpoints';
import { useScenarioContext } from '../../useScenarioContext';
import type { ProjectTreeNode } from '@/types/api';

const SURFACE_FALLBACK = 'forecast-grid';

function flattenTree(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  // ProjectTreeNode includes both grouping nodes and project leaves.
  // We only care about project leaves (those with a real project id).
  const out: ProjectTreeNode[] = [];
  const walk = (ns: ProjectTreeNode[]) => {
    for (const n of ns) {
      if (n.type === 'project') out.push(n);
      if (n.children && n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function ProjectsSection() {
  const { ccOwnerScopeCcId } = useScenarioContext();
  const navigate = useNavigate();
  const params = useParams<{ id: string; surfaceKey?: string }>();
  const [projects, setProjects] = useState<ProjectTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    portfolioApi
      .getProjects()
      .then((res) => {
        if (cancelled) return;
        setProjects(flattenTree(res.items));
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
  }, []);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return projects.filter((p) => {
      // CC Owner scope: only show projects whose cost-centre matches.
      // We don't have cc_id on ProjectTreeNode, so this is best-effort
      // until backend exposes a per-project CC. Backend enforces the
      // gate at action-apply time.
      if (ccOwnerScopeCcId && (p as { cc_id?: string }).cc_id) {
        if ((p as { cc_id?: string }).cc_id !== ccOwnerScopeCcId) return false;
      }
      if (lower) {
        const blob = `${p.name} ${p.id}`.toLowerCase();
        if (!blob.includes(lower)) return false;
      }
      return true;
    });
  }, [projects, search, ccOwnerScopeCcId]);

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
        {filtered.slice(0, 200).map((p) => (
          <li key={p.id}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-7 text-xs"
              onClick={() => navigateToProject(p.id)}
            >
              <Folder className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <span className="truncate">{p.name}</span>
            </Button>
          </li>
        ))}
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
