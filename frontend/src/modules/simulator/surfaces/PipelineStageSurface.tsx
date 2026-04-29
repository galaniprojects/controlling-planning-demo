/**
 * v5 B2 — PipelineStageSurface (spec §Editable surfaces #5).
 * Change a project's pipeline stage. Affects backlog membership, envelope
 * consumption, DoI level, and ranking visibility.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

interface Props {
  projectId: string;
}

const STAGES = [
  'Idea',
  'Under Evaluation',
  'Tech Navigator Eval',
  'AI Council',
  'Funded Backlog',
  'Refinement',
  'Approved Plan',
  'Operate',
  'Paused',
  'Completed',
];

export function PipelineStageSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [stage, setStage] = useState('Funded Backlog');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await applyAction({
        scope: 'project',
        action_type: 'change_pipeline_stage',
        project_id: projectId,
        parameters: { pipeline_stage: stage },
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
      title="Pipeline stage"
      subtitle={`Project ${projectId} — change stage; cascades through backlog, envelope, DoI.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            New pipeline stage
          </label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-9 w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Move to stage'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
