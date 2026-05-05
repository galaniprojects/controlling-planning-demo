/**
 * BacklogProjectDetailPage — /backlog/:projectId route shell with 4 tabs.
 * [A-BK-20][A-TN-08][A-TN-09]
 *
 * Tabs:
 * 1. Scores & Ranking — A7's TechNavigatorRubric + ranking context
 * 2. Financial Overview — embeds workbench OverviewTab read-only
 * 3. Master Data — DoI-aware completeness checklist
 * 4. Milestones — read-only milestone strip + table
 *
 * Tab state controlled via URL ?tab=... param for deep-linkability.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/shared/Skeleton';
import { backlogApi } from '@/api/endpoints';
import { techNavigatorApi } from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import type { RankedProjectItem } from '@/types/api';
import type { TechNavigatorProfile } from '@/types/techNavigator';
import { DetailHeader } from './components/detail/DetailHeader';
import { ScoresAndRankingTab } from './components/detail/ScoresAndRankingTab';
import { FinancialOverviewTab } from './components/detail/FinancialOverviewTab';
import { MasterDataTab } from './components/detail/MasterDataTab';
import { MilestonesTab } from './components/detail/MilestonesTab';

type TabId = 'scores' | 'financial' | 'master' | 'milestones';
const VALID_TABS: TabId[] = ['scores', 'financial', 'master', 'milestones'];

export function BacklogProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { context, currentRoleId } = useRole();

  const tabParam = searchParams.get('tab');
  const activeTab: TabId =
    tabParam && VALID_TABS.includes(tabParam as TabId)
      ? (tabParam as TabId)
      : 'scores';

  const [rankingItem, setRankingItem] = useState<RankedProjectItem | null>(null);
  const [tnProfile, setTnProfile] = useState<TechNavigatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Role-based read-only logic
  const role = context?.role ?? '';
  const readOnly = !(role === 'controller' || role === 'project_lead');

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true);
    setError(null);

    Promise.all([
      backlogApi.getBacklog(),
      techNavigatorApi.get(projectId).catch(() => null),
    ])
      .then(([backlogData, tn]) => {
        if (!alive) return;
        // Find this project in ranked or pre-funded list
        const found =
          backlogData.items.find((i) => i.project_id === projectId) ??
          backlogData.pre_funded.find((i) => i.project_id === projectId) ??
          null;
        setRankingItem(found);
        setTnProfile(tn);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message ?? 'Failed to load project data');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [projectId, currentRoleId]);

  function setTab(tab: TabId) {
    // Use { replace: true } so tab changes do not stack history entries.
    // Otherwise the DetailHeader's navigate(-1) Back button only goes back
    // one tab instead of returning to the backlog list.
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  }

  if (!projectId) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        No project ID in URL.
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <DetailHeader
        item={rankingItem}
        loading={loading}
        projectId={projectId}
      />

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setTab(v as TabId)}
        className="w-full"
      >
        <TabsList variant="line" className="border-b border-border">
          <TabsTrigger value="scores">Scores &amp; Ranking</TabsTrigger>
          <TabsTrigger value="financial">Financial Overview</TabsTrigger>
          <TabsTrigger value="master">Master Data</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="scores" className="pt-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <ScoresAndRankingTab
              projectId={projectId}
              rankingItem={rankingItem}
              readOnly={readOnly}
            />
          )}
        </TabsContent>

        <TabsContent value="financial" className="pt-4">
          <FinancialOverviewTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="master" className="pt-4">
          <MasterDataTab
            rankingItem={rankingItem}
            tnProfile={tnProfile}
            loading={loading}
            projectId={projectId}
          />
        </TabsContent>

        <TabsContent value="milestones" className="pt-4">
          <MilestonesTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
