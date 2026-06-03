/**
 * Project-scope Session 3 (T1) — project-plan editor (spec §3 items 6 & 7).
 *
 * Edit, within the scenario: project start / end dates (the grid reflects the
 * shifted window), pipeline stage, DoI gate, and milestone forecast dates/names.
 * Open to all authors (NOT Tier-3). Each field is an independent overlay target
 * (ScenarioPlanEdit) with its own Save / Revert; date edits feed the resolved
 * window, so a date change triggers `onMutated` to refetch the grid.
 *
 * Mounted as one child of `ForecastGridSurface`. Plan state is loaded fresh from
 * the GET /plan endpoint each time the dialog opens and re-read after each write.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScenarioContext } from '../../useScenarioContext';
import {
  scenariosApi,
  type PlanTarget,
  type ScenarioPlanResponse,
} from '../../api/scenariosApi';

interface Props {
  projectId: string;
  onMutated: () => void;
}

function ChangedBadge() {
  return (
    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
      edited
    </span>
  );
}

export function PlanEditorModal({ projectId, onMutated }: Props) {
  const { scenarioId, writePlanEdit, revertPlanEdit } = useScenarioContext();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ScenarioPlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local working values for the scalar fields.
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [stage, setStage] = useState('');
  const [doi, setDoi] = useState('');

  const syncFromPlan = useCallback((p: ScenarioPlanResponse) => {
    setPlan(p);
    setStartMonth(p.start_month ?? '');
    setEndMonth(p.end_month ?? '');
    setStage(p.stage ?? '');
    setDoi(p.doi != null ? String(p.doi) : '');
  }, []);

  const loadPlan = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await scenariosApi.getScenarioPlan(scenarioId, projectId);
      syncFromPlan(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setBusy(false);
    }
  }, [scenarioId, projectId, syncFromPlan]);

  useEffect(() => {
    if (open) void loadPlan();
  }, [open, loadPlan]);

  const save = async (target: PlanTarget, value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await writePlanEdit(projectId, { target, value });
      syncFromPlan(res.plan);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save plan edit');
    } finally {
      setBusy(false);
    }
  };

  const revert = async (target: PlanTarget, milestoneId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await revertPlanEdit(projectId, {
        target,
        milestone_id: milestoneId,
      });
      syncFromPlan(res.plan);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revert plan edit');
    } finally {
      setBusy(false);
    }
  };

  const saveMilestone = async (
    milestoneId: string,
    payload: { name?: string; forecast_start?: string; forecast_end?: string },
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await writePlanEdit(projectId, {
        target: 'milestone',
        milestone_id: milestoneId,
        entry_json: payload,
      });
      syncFromPlan(res.plan);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save milestone');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarRange className="h-4 w-4 mr-1" />
          Edit plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project plan</DialogTitle>
        </DialogHeader>

        {!plan ? (
          <p className="text-sm text-muted-foreground">Loading plan…</p>
        ) : (
          <div className="space-y-4">
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="flex items-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Start month
                  {plan.start_changed && <ChangedBadge />}
                </label>
                <div className="flex gap-1">
                  <Input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="h-9 font-mono"
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    onClick={() => save('start_month', startMonth)}
                    disabled={busy || !startMonth || startMonth === plan.start_month}
                  >
                    Save
                  </Button>
                  {plan.start_changed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revert('start_month')}
                      disabled={busy}
                      aria-label="Revert start month"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="flex items-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  End month
                  {plan.end_changed && <ChangedBadge />}
                </label>
                <div className="flex gap-1">
                  <Input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    className="h-9 font-mono"
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    onClick={() => save('end_month', endMonth)}
                    disabled={busy || !endMonth || endMonth === plan.end_month}
                  >
                    Save
                  </Button>
                  {plan.end_changed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revert('end_month')}
                      disabled={busy}
                      aria-label="Revert end month"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Stage + DoI */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="flex items-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Pipeline stage
                  {plan.stage_changed && <ChangedBadge />}
                </label>
                <div className="flex gap-1">
                  <Input
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="h-9"
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    onClick={() => save('stage', stage)}
                    disabled={busy || !stage || stage === plan.stage}
                  >
                    Save
                  </Button>
                  {plan.stage_changed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revert('stage')}
                      disabled={busy}
                      aria-label="Revert stage"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="flex items-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  DoI (0–5)
                  {plan.doi_changed && <ChangedBadge />}
                </label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="5"
                    value={doi}
                    onChange={(e) => setDoi(e.target.value)}
                    className="h-9 font-mono"
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    onClick={() => save('doi', doi)}
                    disabled={busy || doi === '' || doi === String(plan.doi ?? '')}
                  >
                    Save
                  </Button>
                  {plan.doi_changed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revert('doi')}
                      disabled={busy}
                      aria-label="Revert DoI"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Milestones */}
            {plan.milestones.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Milestones</h4>
                <ul className="space-y-2">
                  {plan.milestones.map((m) => (
                    <MilestoneRow
                      key={m.milestone_id}
                      milestone={m}
                      busy={busy}
                      onSave={(payload) => saveMilestone(m.milestone_id, payload)}
                      onRevert={() => revert('milestone', m.milestone_id)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MilestoneRowProps {
  milestone: ScenarioPlanResponse['milestones'][number];
  busy: boolean;
  onSave: (payload: {
    name?: string;
    forecast_start?: string;
    forecast_end?: string;
  }) => void;
  onRevert: () => void;
}

function MilestoneRow({ milestone, busy, onSave, onRevert }: MilestoneRowProps) {
  const [name, setName] = useState(milestone.name);
  const [start, setStart] = useState(milestone.forecast_start ?? '');
  const [end, setEnd] = useState(milestone.forecast_end ?? '');

  useEffect(() => {
    setName(milestone.name);
    setStart(milestone.forecast_start ?? '');
    setEnd(milestone.forecast_end ?? '');
  }, [milestone]);

  return (
    <li className="rounded-md border border-border p-2 space-y-2">
      <div className="flex items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-sm"
          disabled={busy}
        />
        {milestone.is_changed && <ChangedBadge />}
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="month"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 font-mono text-xs"
          disabled={busy}
        />
        <Input
          type="month"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 font-mono text-xs"
          disabled={busy}
        />
        <Button
          size="sm"
          onClick={() =>
            onSave({ name, forecast_start: start, forecast_end: end })
          }
          disabled={busy}
        >
          Save
        </Button>
        {milestone.is_changed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRevert}
            disabled={busy}
            aria-label="Revert milestone"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}
