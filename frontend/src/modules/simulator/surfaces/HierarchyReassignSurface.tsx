/**
 * v5 B2 — HierarchyReassignSurface (spec §Editable surfaces #17).
 * Move a project to a different node in the active portfolio hierarchy.
 *
 * Sim no-op fix (NEW-1/NEW-2): the raw `ge-…` text input is replaced with a
 * Select populated from the active portfolio hierarchy (reusing the
 * `adminApi.getActiveHierarchy()` pattern via `useActiveHierarchy`), and when
 * the surface is opened without a project in the URL the user picks one from
 * a project Select sourced from the scenario's `project_states`, so the
 * submitted action always carries a real `project_id` + `hierarchy_node_id`.
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useActiveHierarchy,
  type HierarchyEntity,
} from '@/hooks/useActiveHierarchy';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

interface Props {
  projectId: string;
}

interface NodeOption {
  value: string;
  label: string;
}

/**
 * Flatten the nested active-hierarchy tree into a depth-indented option list.
 * Mirrors `flattenHierarchy` in catalogue/ActionForm.tsx; kept local so this
 * surface doesn't have to reach into the shared catalogue module.
 */
function flattenHierarchy(entities: HierarchyEntity[]): NodeOption[] {
  const out: NodeOption[] = [];
  const walk = (nodes: HierarchyEntity[], depth: number) => {
    for (const n of nodes) {
      out.push({ value: n.id, label: `${'— '.repeat(depth)}${n.name}` });
      if (Array.isArray(n.children) && n.children.length > 0) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(entities, 0);
  return out;
}

export function HierarchyReassignSurface({ projectId }: Props) {
  const { applyAction, detail } = useScenarioContext();
  const { entityTree, isLoading: hierarchyLoading } = useActiveHierarchy();
  const [targetNodeId, setTargetNodeId] = useState('');
  // NEW-2: when no project is fixed by the URL, the user must pick one.
  const [pickedProjectId, setPickedProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nodeOptions = useMemo(() => flattenHierarchy(entityTree), [entityTree]);
  const projectOptions = useMemo(
    () =>
      (detail?.project_states ?? []).map((p) => ({
        value: p.project_id,
        label: p.project_name || p.project_id,
      })),
    [detail],
  );

  const needsProjectPick = !projectId;
  const effectiveProjectId = projectId || pickedProjectId;

  const handleSubmit = async () => {
    if (!effectiveProjectId || !targetNodeId) return;
    setSubmitting(true);
    setErr(null);
    try {
      await applyAction({
        scope: 'project',
        action_type: 'reassign_hierarchy',
        project_id: effectiveProjectId,
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
      subtitle={
        needsProjectPick
          ? 'Pick a project, then move it under a different active hierarchy node.'
          : `Project ${projectId} — move under a different active hierarchy node.`
      }
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        {needsProjectPick && (
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Project
            </label>
            <Select
              value={pickedProjectId}
              onValueChange={setPickedProjectId}
              disabled={projectOptions.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue
                  placeholder={
                    projectOptions.length === 0
                      ? 'No projects in scenario'
                      : 'Select a project…'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Target hierarchy node
          </label>
          <Select
            value={targetNodeId}
            onValueChange={setTargetNodeId}
            disabled={hierarchyLoading || nodeOptions.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder={
                  hierarchyLoading
                    ? 'Loading hierarchy…'
                    : nodeOptions.length === 0
                      ? 'No active hierarchy'
                      : 'Select a node…'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {nodeOptions.map((n) => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Cascades through per-node budget aggregation and KPIs.
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={submitting || !targetNodeId || !effectiveProjectId}
          >
            {submitting ? 'Applying…' : 'Reassign'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
