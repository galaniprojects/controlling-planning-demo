import { useState, useEffect, useCallback } from 'react';
import { Plus, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { scenariosApi } from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import type { ScenarioListItem } from '@/types/api';
import { ScenarioTable } from './ScenarioTable';
import { CreateScenarioModal } from './CreateScenarioModal';

interface Props {
  onOpenScenario: (id: number) => void;
  onCompare: () => void;
}

export function ScenarioManager({ onOpenScenario, onCompare }: Props) {
  const { context } = useRole();
  const isExecutive = context?.role === 'executive';
  const [myScenarios, setMyScenarios] = useState<ScenarioListItem[]>([]);
  const [publishedScenarios, setPublishedScenarios] = useState<
    ScenarioListItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    scenariosApi.list().then((res) => {
      if (cancelled) return;
      setMyScenarios(res.my_scenarios);
      setPublishedScenarios(res.published_scenarios);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleClone = async (id: number) => {
    const source = [...myScenarios, ...publishedScenarios].find(
      (s) => s.id === id,
    );
    const name = source ? `${source.name} (Copy)` : 'Cloned Scenario';
    try {
      const result = await scenariosApi.create({
        name,
        clone_from: id,
      });
      onOpenScenario(result.id);
    } catch {
      refresh();
    }
  };

  const handlePublish = async (id: number) => {
    try {
      await scenariosApi.publish(id);
    } finally {
      refresh();
    }
  };

  const handleUnpublish = async (id: number) => {
    try {
      await scenariosApi.unpublish(id);
    } finally {
      refresh();
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await scenariosApi.remove(id);
    } finally {
      refresh();
    }
  };

  const handleCreated = (id: number) => {
    onOpenScenario(id);
  };

  const currentUserName = context?.user_name ?? '';
  const allScenarios = [...myScenarios, ...publishedScenarios];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCompare}>
          <GitCompare className="h-4 w-4 mr-1.5" />
          Compare Scenarios
        </Button>
        {!isExecutive && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create New Scenario
          </Button>
        )}
      </div>

      {/* My Scenarios */}
      <ScenarioTable
        title="My Scenarios"
        scenarios={myScenarios}
        onOpen={onOpenScenario}
        onClone={handleClone}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={handleDelete}
        currentUserName={currentUserName}
      />

      {/* Published Scenarios */}
      <ScenarioTable
        title="Published Scenarios"
        scenarios={publishedScenarios}
        onOpen={onOpenScenario}
        onClone={handleClone}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={handleDelete}
        currentUserName={currentUserName}
      />

      {/* Create modal */}
      <CreateScenarioModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        scenarios={allScenarios}
        onCreated={handleCreated}
      />
    </div>
  );
}
