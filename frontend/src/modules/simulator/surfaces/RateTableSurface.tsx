/**
 * v5 B2 — RateTableSurface (spec §Editable surfaces #2 + catalogue action 17).
 *
 * Allows the controller to apply a percentage adjustment to a rate table
 * inside the scenario sandbox. Backend dispatch: `rate_escalation` action.
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

type RateScope = 'internal' | 'external' | 'all';

export function RateTableSurface() {
  const { applyAction } = useScenarioContext();
  const [pct, setPct] = useState('5');
  const [scope, setScope] = useState<RateScope>('internal');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const value = Number(pct);
      if (Number.isNaN(value)) {
        setErr('Percentage must be numeric (negative for cuts).');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'portfolio',
        action_type: 'rate_escalation',
        parameters: { pct: value, rate_scope: scope },
        lever_category: 'rate_table',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Rate tables"
      subtitle="Adjust internal or external rate tables. Cascades through every cost line in the scenario."
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Scope
            </label>
            <Select value={scope} onValueChange={(v) => setScope(v as RateScope)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal rates</SelectItem>
                <SelectItem value="external">External rates</SelectItem>
                <SelectItem value="all">All rates</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Percentage delta
            </label>
            <Input
              type="number"
              step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-[140px] h-9 font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply rate adjustment'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
