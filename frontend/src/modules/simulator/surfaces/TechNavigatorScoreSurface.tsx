/**
 * v5 B2 — TechNavigatorScoreSurface (spec §Editable surfaces #6).
 * Edit Complexity (CX1..CX3) and Value Creation (VC1..VC3) sub-criteria
 * for a project. Score changes recalculate the composite ranking and can
 * shift cutoff line positions in the backlog.
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

const SUB_CRITERIA: { key: string; label: string }[] = [
  { key: 'complexity_1', label: 'Complexity 1' },
  { key: 'complexity_2', label: 'Complexity 2' },
  { key: 'complexity_3', label: 'Complexity 3' },
  { key: 'value_creation_1', label: 'Value Creation 1' },
  { key: 'value_creation_2', label: 'Value Creation 2' },
  { key: 'value_creation_3', label: 'Value Creation 3' },
];

export function TechNavigatorScoreSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(SUB_CRITERIA.map((s) => [s.key, ''])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setScore = (k: string, v: string) =>
    setScores((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const parameters: Record<string, number> = {};
      for (const s of SUB_CRITERIA) {
        const raw = scores[s.key];
        if (raw === undefined || raw === '') continue;
        const n = Number(raw);
        if (Number.isNaN(n) || n < 1 || n > 5) {
          setErr(`${s.label}: must be 1–5.`);
          setSubmitting(false);
          return;
        }
        parameters[s.key] = n;
      }
      if (Object.keys(parameters).length === 0) {
        setErr('Provide at least one sub-criterion change.');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'project',
        action_type: 'edit_tech_navigator_scores',
        project_id: projectId,
        parameters,
        lever_category: 'tech_navigator',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Tech Navigator scores"
      subtitle={`Project ${projectId} — edit Complexity & Value Creation sub-criteria (1–5 each).`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SUB_CRITERIA.map((s) => (
            <div key={s.key} className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </label>
              <Input
                type="number"
                min={1}
                max={5}
                step={1}
                value={scores[s.key] ?? ''}
                onChange={(e) => setScore(s.key, e.target.value)}
                placeholder="leave blank = no change"
                className="h-9 font-mono"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply score change'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
