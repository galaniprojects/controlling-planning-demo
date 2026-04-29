/**
 * v5 B2 — VendorContractsSurface (spec §Editable surfaces #9 + catalogue 9, 10).
 * Renegotiate vendor contract amount, schedule, or rate.
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

type Field = 'amount' | 'rate' | 'schedule_shift_months';

export function VendorContractsSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [field, setField] = useState<Field>('amount');
  const [vendor, setVendor] = useState('');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const v = Number(value);
      if (Number.isNaN(v)) {
        setErr('Numeric value required.');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'project',
        action_type: 'adjust_external_cost',
        project_id: projectId,
        parameters: { vendor, field, value: v },
        lever_category: 'cost_allocation',
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Vendor contracts"
      subtitle={`Project ${projectId} — renegotiate amounts, rates, or schedules.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Field
            </label>
            <Select value={field} onValueChange={(v) => setField(v as Field)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Total amount (EUR)</SelectItem>
                <SelectItem value="rate">Rate (EUR/h)</SelectItem>
                <SelectItem value="schedule_shift_months">Schedule shift (months)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Vendor
            </label>
            <Input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Acme GmbH"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Value
            </label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || !vendor || !value}>
            {submitting ? 'Applying…' : 'Apply renegotiation'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
