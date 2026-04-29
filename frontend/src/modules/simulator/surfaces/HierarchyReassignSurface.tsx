/**
 * v5 B2 — HierarchyReassignSurface (spec §Editable surfaces #17).
 * Move a project to a different node in the active portfolio hierarchy.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

interface Props {
  projectId: string;
}

export function HierarchyReassignSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [targetNodeId, setTargetNodeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await applyAction({
        scope: 'project',
        action_type: 'reassign_hierarchy',
        project_id: projectId,
        parameters: { hierarchy_node_id: targetNodeId },
        lever_category: 'pipeline_stage',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Hierarchy reassign"
      subtitle={`Project ${projectId} — move under a different active hierarchy node.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Target hierarchy node ID
          </label>
          <Input
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
            placeholder="e.g. ge-…"
            className="h-9 font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Cascades through per-node budget aggregation and KPIs.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || !targetNodeId}>
            {submitting ? 'Applying…' : 'Reassign'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
