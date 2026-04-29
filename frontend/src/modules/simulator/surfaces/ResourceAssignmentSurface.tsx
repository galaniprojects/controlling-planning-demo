/**
 * v5 B2 — ResourceAssignmentSurface (spec §Editable surfaces #3).
 *
 * Adjust the planned hours for a person × project × month tuple. The
 * backend `change_allocation` action persists the override; the impact
 * engine cascades through capacity utilisation.
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

export function ResourceAssignmentSurface({ projectId }: Props) {
  const { applyAction, ccOwnerScopeCcId } = useScenarioContext();
  const [personId, setPersonId] = useState('');
  const [month, setMonth] = useState('2026-07');
  const [hours, setHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const h = Number(hours);
      if (Number.isNaN(h) || h < 0) {
        setErr('Hours must be a non-negative number.');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'project',
        action_type: 'change_allocation',
        project_id: projectId,
        parameters: {
          person_id: personId,
          month,
          hours: h,
          ...(ccOwnerScopeCcId ? { cc_id: ccOwnerScopeCcId } : {}),
        },
        lever_category: 'people',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Resource assignments"
      subtitle={`Project ${projectId} — adjust planned hours by person × month.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Person ID
            </label>
            <Input
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              placeholder="P-…"
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Month
            </label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Hours
            </label>
            <Input
              type="number"
              step="0.5"
              min={0}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || !personId || !hours}>
            {submitting ? 'Applying…' : 'Apply allocation'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
