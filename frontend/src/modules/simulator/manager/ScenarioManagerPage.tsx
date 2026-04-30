/**
 * v5 B2 — Scenario Manager page.
 *
 * Replaces v4 ScenarioManager.tsx wholesale. Surfaces:
 *  - Create / Compare / Show-archived top bar
 *  - Tag filter chips
 *  - My Scenarios + Published Scenarios + (optional) Archived tables
 *  - Rebase + archive + clone + publish + delete actions
 *
 * PL persona is excluded from creation per [E-06c]; backend already
 * rejects non-controller/exec/cc-owner POST. Frontend hides the button.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCompare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { useRole } from '@/contexts/RoleContext';
import type { ScenarioListItem, ScenarioListResponse } from '@/types/api';
import { scenariosApi } from '../api/scenariosApi';
import { useCanCreateScenario } from '../permissions/useCanCreateScenario';
import { ArchivedToggle } from './ArchivedToggle';
import { CreateScenarioModal } from './CreateScenarioModal';
import { MyScenariosTable } from './MyScenariosTable';
import { PublishedScenariosTable } from './PublishedScenariosTable';
import { RebaseModal } from './RebaseModal';
import { TagFilterBar } from './TagFilterBar';

export function ScenarioManagerPage() {
  const navigate = useNavigate();
  const { context } = useRole();
  const canCreate = useCanCreateScenario();
  const currentUserName = context?.user_name ?? '';

  const [response, setResponse] = useState<ScenarioListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [rebaseTarget, setRebaseTarget] = useState<ScenarioListItem | null>(
    null,
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    scenariosApi
      .list({
        include_archived: showArchived,
        tag: activeTag ?? undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setResponse(res);
      })
      .catch(() => {
        if (cancelled) return;
        setResponse({
          my_scenarios: [],
          published_scenarios: [],
          archived_scenarios: [],
          available_tags: [],
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showArchived, activeTag, refreshKey]);

  const handleOpen = useCallback(
    (id: number) => navigate(`/simulator/scenarios/${id}`),
    [navigate],
  );

  const handleCompare = useCallback(
    () => navigate('/simulator/compare'),
    [navigate],
  );

  const handleClone = useCallback(
    async (id: number) => {
      const all = response
        ? [
            ...response.my_scenarios,
            ...response.published_scenarios,
            ...(response.archived_scenarios ?? []),
          ]
        : [];
      const source = all.find((s) => s.id === id);
      const name = source ? `${source.name} (Copy)` : 'Cloned Scenario';
      try {
        const result = await scenariosApi.create({ name, clone_from: id });
        navigate(`/simulator/scenarios/${result.id}`);
      } catch {
        refresh();
      }
    },
    [response, navigate, refresh],
  );

  const handlePublish = useCallback(
    async (id: number) => {
      try {
        await scenariosApi.publish(id);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const handleUnpublish = useCallback(
    async (id: number) => {
      try {
        await scenariosApi.unpublish(id);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const handleArchive = useCallback(
    async (id: number, archived: boolean) => {
      try {
        await scenariosApi.archive(id, archived);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await scenariosApi.remove(id);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const handleRebaseClick = useCallback(
    (id: number) => {
      const all = response
        ? [
            ...response.my_scenarios,
            ...(response.archived_scenarios ?? []),
          ]
        : [];
      const target = all.find((s) => s.id === id);
      if (target) setRebaseTarget(target);
    },
    [response],
  );

  const handleRebaseConfirm = useCallback(
    async (newAnchorVersionId: number) => {
      if (!rebaseTarget) return;
      await scenariosApi.rebase(rebaseTarget.id, {
        new_anchor_version_id: newAnchorVersionId,
      });
      refresh();
    },
    [rebaseTarget, refresh],
  );

  const allScenariosForClone = useMemo(() => {
    if (!response) return [];
    return [
      ...response.my_scenarios,
      ...response.published_scenarios,
      ...(response.archived_scenarios ?? []),
    ];
  }, [response]);

  if (loading && !response) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <ModuleHeader
        title="What-If Simulator"
        actions={
          <>
            <ModuleGuideButton moduleId="whatif_simulator" />
            <Button variant="outline" size="sm" onClick={handleCompare}>
              <GitCompare className="h-4 w-4 mr-1.5" />
              Compare Scenarios
            </Button>
            <ArchivedToggle
              showArchived={showArchived}
              onToggle={setShowArchived}
            />
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create New Scenario
              </Button>
            )}
          </>
        }
      />

      <TagFilterBar
        availableTags={response?.available_tags ?? []}
        activeTag={activeTag}
        onChange={setActiveTag}
      />

      <MyScenariosTable
        scenarios={response?.my_scenarios ?? []}
        currentUserName={currentUserName}
        onOpen={handleOpen}
        onClone={handleClone}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onRebase={handleRebaseClick}
      />

      <PublishedScenariosTable
        scenarios={response?.published_scenarios ?? []}
        currentUserName={currentUserName}
        onOpen={handleOpen}
        onClone={handleClone}
      />

      {showArchived && response?.archived_scenarios && response.archived_scenarios.length > 0 && (
        <div className="space-y-2">
          <MyScenariosTable
            scenarios={response.archived_scenarios}
            currentUserName={currentUserName}
            onOpen={handleOpen}
            onClone={handleClone}
            onPublish={handlePublish}
            onUnpublish={handleUnpublish}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onRebase={handleRebaseClick}
          />
        </div>
      )}

      <CreateScenarioModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        cloneCandidates={allScenariosForClone}
        onCreated={(id) => navigate(`/simulator/scenarios/${id}`)}
      />

      <RebaseModal
        open={Boolean(rebaseTarget)}
        onOpenChange={(open) => {
          if (!open) setRebaseTarget(null);
        }}
        scenarioName={rebaseTarget?.name ?? ''}
        currentAnchorVersionId={rebaseTarget?.anchor_forecast_version_id ?? null}
        onConfirm={handleRebaseConfirm}
      />
    </div>
  );
}
