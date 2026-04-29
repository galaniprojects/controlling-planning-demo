/**
 * v5 B2 — BudgetEnvelopeSurface (spec §Editable surfaces #7).
 * Change total available budget. Cascades through cutoff line + contestable
 * envelope calculations.
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

type Mode = 'absolute' | 'percent';

export function BudgetEnvelopeSurface() {
  const { applyAction } = useScenarioContext();
  const [mode, setMode] = useState<Mode>('percent');
  const [value, setValue] = useState('-10');
  const [year, setYear] = useState('2026');
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
        scope: 'portfolio',
        action_type: 'change_budget_envelope',
        parameters: {
          mode,
          value: v,
          year: Number(year) || 2026,
        },
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
      title="Total available budget"
      subtitle="Cascades through the cutoff line and contestable envelope."
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Mode
            </label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage delta</SelectItem>
                <SelectItem value="absolute">Set absolute (EUR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Value {mode === 'percent' ? '(%)' : '(EUR)'}
            </label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Year
            </label>
            <Input
              type="number"
              min={2024}
              max={2030}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-[120px] h-9 font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply envelope change'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
