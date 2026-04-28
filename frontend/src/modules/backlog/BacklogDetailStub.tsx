/**
 * BacklogDetailStub — minimal scaffold harness for visually verifying the
 * Tech Navigator scoring rubric inside a representative project-detail layout.
 *
 * Background: A6 (Backlog frontend) is BLOCKED on A5 and has not been built
 * yet. A7's deliverable lives in the Backlog detail view's "Scores & Ranking"
 * tab. To visually verify A7 in isolation, this stub renders a 4-tab shell
 * mimicking the planned detail view; only the Scores & Ranking tab carries
 * full content. A6 will replace this stub with the real detail view.
 *
 * Route: `/backlog-detail-stub/:projectId` (registered in App.tsx).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Skeleton } from '@/components/shared/Skeleton';
import { workbenchApi, techNavigatorApi } from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import { TechNavigatorRubric } from './components/TechNavigatorRubric';
import type { TechNavigatorProfile } from '@/types/techNavigator';

export function BacklogDetailStub() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { context, currentRoleId } = useRole();

  const [projectName, setProjectName] = useState<string | null>(null);
  const [profileSnapshot, setProfileSnapshot] =
    useState<TechNavigatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve a friendly project name. Reuse the workbench list endpoint so we
  // do not introduce a new backend dependency just for the stub.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      workbenchApi.getProjects(),
      techNavigatorApi.get(projectId).catch(() => null),
    ])
      .then(([list, profile]) => {
        if (!alive) return;
        const match = list.items.find((p) => p.id === projectId);
        setProjectName(match?.name ?? projectId);
        setProfileSnapshot(profile);
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

  if (!projectId) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        No project ID supplied. Navigate to{' '}
        <code className="rounded bg-muted px-1">
          /backlog-detail-stub/&lt;project-id&gt;
        </code>
        .
      </div>
    );
  }

  // Read-only when current role is not allowed to edit Tech Navigator scores.
  // Per the Tech Navigator backend authorization in routers/tech_navigator.py:
  //   - controller: any project
  //   - project_lead: own projects (we do not check ownership client-side; the
  //     server will 403 if the PL is not assigned and the optimistic update
  //     will be rejected. For the stub harness we keep edit affordances open
  //     for PL roles too — the verification interest is the rubric, not the
  //     authorization edge.)
  const role = context?.role ?? '';
  const readOnly = !(role === 'controller' || role === 'project_lead');

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Back"
        >
          <ChevronLeft className="size-3" aria-hidden />
          Back
        </button>
        <span className="text-xs text-muted-foreground">
          Backlog (stub harness — A6 placeholder)
        </span>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {loading ? <Skeleton className="h-7 w-72" /> : projectName}
        </h1>
        <p className="text-xs text-muted-foreground">
          Project ID: <code className="rounded bg-muted px-1">{projectId}</code>
          {profileSnapshot ? (
            <>
              {' · '}
              Composite{' '}
              <span className="font-medium text-foreground">
                {profileSnapshot.composite_score !== null
                  ? `${profileSnapshot.composite_score
                      .toFixed(2)
                      .replace('.', ',')} / 5`
                  : '—'}
              </span>
              {profileSnapshot.tshirt_size ? (
                <>
                  {' · '}
                  T-shirt{' '}
                  <span className="font-medium text-foreground">
                    {profileSnapshot.tshirt_size}
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Tabs defaultValue="scores" className="w-full">
        <TabsList variant="line" className="border-b border-border">
          <TabsTrigger value="scores">Scores &amp; Ranking</TabsTrigger>
          <TabsTrigger value="financial">Financial Overview</TabsTrigger>
          <TabsTrigger value="master">Master Data</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="scores" className="pt-4">
          <TechNavigatorRubric projectId={projectId} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="financial" className="pt-4">
          <StubTabBody label="Financial Overview" />
        </TabsContent>
        <TabsContent value="master" className="pt-4">
          <StubTabBody label="Master Data" />
        </TabsContent>
        <TabsContent value="milestones" className="pt-4">
          <StubTabBody label="Milestones" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StubTabBody({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      <div className="font-medium text-foreground">{label}</div>
      <p className="mt-1">
        Placeholder. A6 will populate this tab as part of the full Backlog
        detail view.
      </p>
    </div>
  );
}
