/**
 * v5 B2 — CapExOpExSurface (spec §Editable surfaces #11).
 * Reclassify cost lines between CapEx and OpEx.
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

export function CapExOpExSurface({ projectId }: Props) {
  const { applyAction } = useScenarioContext();
  const [subCategory, setSubCategory] = useState('');
  const [target, setTarget] = useState<'capex' | 'opex'>('opex');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await applyAction({
        scope: 'project',
        action_type: 'reclassify_capex_opex',
        project_id: projectId,
        parameters: { sub_category: subCategory, target },
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
      title="CapEx / OpEx classification"
      subtitle={`Project ${projectId} — reclassify a line item between CapEx and OpEx.`}
      error={err}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Line sub-category
            </label>
            <Input
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              placeholder="e.g. consulting, software_dev, hardware"
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Reclassify to
            </label>
            <Select value={target} onValueChange={(v) => setTarget(v as 'capex' | 'opex')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="capex">CapEx</SelectItem>
                <SelectItem value="opex">OpEx</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting || !subCategory}>
            {submitting ? 'Applying…' : 'Apply reclassification'}
          </Button>
        </div>
      </Card>
    </SurfaceCard>
  );
}
