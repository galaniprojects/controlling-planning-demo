/**
 * v5 B2 — MilestonesSurface (spec §Editable surfaces #8).
 *
 * Shift / add / remove milestones in the scenario. Backend stores the
 * action via the generic `apply_action` endpoint; impact computation for
 * milestone-driven trajectory shifts is a B-cluster follow-up.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

interface Props {
  projectId: string;
}

type MilestoneAction = 'shift' | 'add' | 'remove';

export function MilestonesSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [mode, setMode] = useState<MilestoneAction>('shift');
  const [milestoneId, setMilestoneId] = useState('');
  const [shiftMonths, setShiftMonths] = useState('1');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('2026-12');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      let parameters: Record<string, unknown>;
      let actionType: string;
      if (mode === 'shift') {
        actionType = 'shift_milestone';
        parameters = {
          milestone_id: milestoneId,
          months: Number(shiftMonths) || 0,
        };
      } else if (mode === 'add') {
        actionType = 'add_milestone';
        parameters = { name: newName, baseline_date: newDate };
      } else {
        actionType = 'remove_milestone';
        parameters = { milestone_id: milestoneId };
      }
      await applyAction({
        scope: 'project',
        action_type: actionType,
        project_id: projectId,
        parameters,
        lever_category: 'milestone',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Milestones"
      subtitle={`Project ${projectId} — shift, add, or remove milestone dates.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Action
            </label>
            <Select value={mode} onValueChange={(v) => setMode(v as MilestoneAction)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shift">Shift existing milestone</SelectItem>
                <SelectItem value="add">Add milestone</SelectItem>
                <SelectItem value="remove">Remove milestone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(mode === 'shift' || mode === 'remove') && (
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Milestone ID
              </label>
              <Input
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                placeholder="M-…"
                className="h-9 font-mono"
              />
            </div>
          )}
          {mode === 'shift' && (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Shift by (months)
              </label>
              <Input
                type="number"
                step="1"
                value={shiftMonths}
                onChange={(e) => setShiftMonths(e.target.value)}
                className="h-9 font-mono"
              />
            </div>
          )}
          {mode === 'add' && (
            <>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Baseline date
                </label>
                <Input
                  type="month"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-9 font-mono"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply milestone change'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
