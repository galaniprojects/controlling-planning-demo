/**
 * v5 B2 — HypotheticalProjectSurface (spec §Editable surfaces #16).
 * Inject a hypothetical project that exists only in this scenario.
 * Carries an estimated budget + Tech Navigator scores + pipeline stage so
 * the backlog ranks it correctly. Promote step turns it into a real
 * Proposed (DoI 0) project.
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

export function HypotheticalProjectSurface() {
  const { applyAction } = useScenarioContext();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('500000');
  const [type, setType] = useState<'1' | '2' | '3'>('1');
  const [tlevel, setTlevel] = useState<'T0' | 'T1' | 'T2'>('T1');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      if (!name.trim()) {
        setErr('Project name required.');
        setSubmitting(false);
        return;
      }
      await applyAction({
        scope: 'portfolio',
        action_type: 'inject_hypothetical_project',
        parameters: {
          name,
          total_budget: Number(budget) || 0,
          project_type: Number(type),
          transformation_level: tlevel,
        },
        lever_category: 'tech_navigator',
      });
      // Reset form for the next injection.
      setName('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Hypothetical project"
      subtitle="Inject a project that exists only in this scenario. Promote turns it into a Proposed project."
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1 md:col-span-2">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Project name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total budget (EUR)
            </label>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Type
            </label>
            <Select value={type} onValueChange={(v) => setType(v as '1' | '2' | '3')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Type 1 — Run/Operate</SelectItem>
                <SelectItem value="2">Type 2 — Change</SelectItem>
                <SelectItem value="3">Type 3 — Pre-funded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Transformation level
            </label>
            <Select value={tlevel} onValueChange={(v) => setTlevel(v as 'T0' | 'T1' | 'T2')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="T0">T0</SelectItem>
                <SelectItem value="T1">T1</SelectItem>
                <SelectItem value="T2">T2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || !name}>
            {submitting ? 'Applying…' : 'Inject project'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
