/**
 * v5 B2 — EscalationFactorsSurface (spec §Editable surfaces #14 + catalogue 16).
 * Apply a percentage escalation/inflation factor from a specified month forward,
 * scoped by cost category, role, and/or hierarchy node.
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

type Category = 'all' | 'internal' | 'external' | 'non_labour';

export function EscalationFactorsSurface() {
  const { applyAction } = useScenarioContext();
  const [pct, setPct] = useState('3');
  const [fromMonth, setFromMonth] = useState('2026-07');
  const [category, setCategory] = useState<Category>('all');
  const [hierarchyNodeId, setHierarchyNodeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await applyAction({
        scope: 'portfolio',
        action_type: 'rate_escalation',
        parameters: {
          pct: Number(pct) || 0,
          from_month: fromMonth,
          category,
          ...(hierarchyNodeId ? { hierarchy_node_id: hierarchyNodeId } : {}),
        },
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
      title="Escalation / inflation factors"
      subtitle="Scope by cost category, role, or hierarchy node — combinable."
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Percentage uplift
            </label>
            <Input
              type="number"
              step="0.1"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="h-9 font-mono w-[140px]"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              From month
            </label>
            <Input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="h-9 font-mono w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Cost category
            </label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="internal">Internal labour</SelectItem>
                <SelectItem value="external">External labour</SelectItem>
                <SelectItem value="non_labour">Non-labour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Hierarchy node (optional)
            </label>
            <Input
              value={hierarchyNodeId}
              onChange={(e) => setHierarchyNodeId(e.target.value)}
              placeholder="ge-…"
              className="h-9 font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply escalation'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
