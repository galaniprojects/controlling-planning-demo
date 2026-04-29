/**
 * v5 B2 — SourcingMixSurface (spec §Editable surfaces #10 + catalogue 6).
 * Shift internal/external hour split per role line.
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

export function SourcingMixSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [internalToExternalPct, setInternalToExternalPct] = useState('15');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const value = Number(internalToExternalPct);
      if (Number.isNaN(value)) {
        setErr('Enter a numeric percentage.');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'project',
        action_type: 'change_sourcing_mix',
        project_id: projectId,
        parameters: { internal_to_external_pct: value },
        lever_category: 'forecast_grid',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Sourcing mix"
      subtitle={`Project ${projectId} — shift hours from internal → external (positive) or external → internal (negative).`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            % of internal hours to externalise
          </label>
          <Input
            type="number"
            step="0.5"
            value={internalToExternalPct}
            onChange={(e) => setInternalToExternalPct(e.target.value)}
            className="w-[140px] h-9 font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Rate differential is applied automatically based on the relevant
            internal/external rate tables.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply sourcing shift'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
