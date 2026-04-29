/**
 * v5 B2 — RunningCostsSurface (spec §Editable surfaces #15 + catalogue 7).
 * Operate-stage projects: change termination date or trim ongoing cost tail.
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

type Mode = 'set_termination' | 'scale_run_costs';

export function RunningCostsSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [mode, setMode] = useState<Mode>('set_termination');
  const [terminationMonth, setTerminationMonth] = useState('2027-12');
  const [pct, setPct] = useState('-15');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      if (mode === 'set_termination') {
        await applyAction({
          scope: 'project',
          action_type: 'set_termination_date',
          project_id: projectId,
          parameters: { termination_month: terminationMonth },
          lever_category: 'forecast_grid',
        });
      } else {
        await applyAction({
          scope: 'project',
          action_type: 'scale_run_costs',
          project_id: projectId,
          parameters: { pct: Number(pct) || 0 },
          lever_category: 'forecast_grid',
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Running costs"
      subtitle={`Project ${projectId} — adjust ongoing run-state costs (Operate-stage).`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Action
            </label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="set_termination">Set termination date</SelectItem>
                <SelectItem value="scale_run_costs">Scale run costs by %</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'set_termination' ? (
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Termination month
              </label>
              <Input
                type="month"
                value={terminationMonth}
                onChange={(e) => setTerminationMonth(e.target.value)}
                className="h-9 font-mono w-[160px]"
              />
            </div>
          ) : (
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Percentage delta
              </label>
              <Input
                type="number"
                step="0.5"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="h-9 font-mono w-[140px]"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply running-cost change'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
