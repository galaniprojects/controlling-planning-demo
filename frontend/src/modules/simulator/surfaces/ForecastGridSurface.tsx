/**
 * v5 B2 — Forecast grid sandbox surface (spec §Editable surfaces #1).
 *
 * Embeds the C2 `MixedGranularityGrid` in sandbox mode by passing the
 * scenario version. Edits to forecast cells are not directly supported
 * here yet (the grid is read-mode in C2; cell-level editing is a future
 * Wave). For now the surface offers two action helpers:
 *   - "Apply across-the-board % to project" — dispatches `adjust_budget`
 *     to scale all forecast lines.
 *   - "Apply percentage cut to internal vs external" — dispatches
 *     `cut_consulting` (engine alias).
 *
 * The pattern matches the spec line 1048 contract: every diff-changing
 * action goes through ScenarioContext.applyAction, which appends an
 * entry to the change summary feed and sets the stale flag.
 */
import { useState } from 'react';
import { MixedGranularityGrid } from '@/modules/workbench/forecast/MixedGranularityGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useScenarioContext } from '../useScenarioContext';
import { SurfaceCard } from './SurfaceCard';

interface Props {
  projectId: string;
}

type AdjustMode = 'scale' | 'remove' | 'pause';

export function ForecastGridSurface({ projectId }: Props) {
  const { applyAction, scenarioVersion, error: ctxError } = useScenarioContext();
  const [mode, setMode] = useState<AdjustMode>('scale');
  const [pct, setPct] = useState<string>('-10');
  const [pauseMonth, setPauseMonth] = useState<string>('2026-07');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      if (mode === 'scale') {
        const value = Number(pct);
        if (Number.isNaN(value)) {
          setLocalError('Enter a numeric percentage (e.g. -10 for a 10% cut).');
          setSubmitting(false);
          return;
        }
        await applyAction({
          scope: 'project',
          action_type: 'adjust_budget',
          project_id: projectId,
          parameters: { pct: value },
          lever_category: 'forecast_grid',
        });
      } else if (mode === 'remove') {
        await applyAction({
          scope: 'project',
          action_type: 'remove_project',
          project_id: projectId,
          parameters: {},
          lever_category: 'forecast_grid',
        });
      } else if (mode === 'pause') {
        await applyAction({
          scope: 'project',
          action_type: 'pause_project',
          project_id: projectId,
          parameters: { pause_month: pauseMonth },
          lever_category: 'forecast_grid',
        });
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard
      title="Forecast grid"
      subtitle={`Project ${projectId} — sandbox edits use scenario-fork forecast cells.`}
      error={localError ?? ctxError}
      busy={submitting}
    >
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Action
            </label>
            <Select value={mode} onValueChange={(v) => setMode(v as AdjustMode)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scale">Scale all lines by %</SelectItem>
                <SelectItem value="remove">Remove project entirely</SelectItem>
                <SelectItem value="pause">Pause from a month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'scale' && (
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Percentage delta (negative = cut)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.5"
                  min={-100}
                  max={500}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  className="w-[140px] h-9 font-mono"
                />
                <span className="text-xs text-muted-foreground">% (negative cuts, positive grows)</span>
              </div>
            </div>
          )}
          {mode === 'pause' && (
            <div className="space-y-1 md:col-span-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Pause from (month)
              </label>
              <Input
                type="month"
                value={pauseMonth}
                onChange={(e) => setPauseMonth(e.target.value)}
                className="w-[160px] h-9 font-mono"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Applying…' : 'Apply to scenario'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
          Sandbox forecast (read-only)
        </p>
        <MixedGranularityGrid
          projectId={projectId}
          nameMap={{}}
          deltaIndex={new Map()}
          comparisonActive={false}
          scenarioVersion={scenarioVersion}
        />
      </Card>
    </SurfaceCard>
  );
}
