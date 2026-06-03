/**
 * Project-scope Session 2 — four-macro strip.
 *
 * The Layer-1 macros (spec §4) as a compact action strip above the editable
 * grid: Delay N / Pause N / Accelerate N (each a 1–12 month Input + Apply) and
 * Remove (destructive). Every macro dispatches a project-scope action through
 * `applyAction` — the same diff-changing path that marks the scenario stale and
 * appends a change-feed entry.
 *
 * Param decision: the engine reads N via `macros._get_n`, whose accepted keys
 * include `months` (alongside the seed's `delay_months` / `advance_months` /
 * `pause_months`). So all three numeric macros send `{ months: N }` — including
 * `pause_project`, which does NOT read the legacy `pause_month` date. Evidence:
 * `backend/services/scenario_project_scope/macros.py` `_get_n` + `_pause` (N
 * comes from `_get_n`, not from `pause_month`).
 *
 * Active macros render as removable chips read from `detail.actions` filtered
 * to this project + the macro types; the impact only updates after Recalculate
 * (labelled on the strip). Accelerate clamp notes (when the engine clamps N)
 * are surfaced from `impact_dashboard.macro_notes`.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CalendarClock,
  PauseCircle,
  FastForward,
  Trash2,
  X,
  Info,
} from 'lucide-react';
import { useScenarioContext } from '../../useScenarioContext';
import type { ScenarioAction, ScenarioImpactDashboard } from '@/types/api';

interface Props {
  projectId: string;
}

const MACRO_TYPES = [
  'delay_project',
  'pause_project',
  'accelerate_project',
  'remove_project',
] as const;
type MacroType = (typeof MACRO_TYPES)[number];

const MACRO_LABEL: Record<MacroType, string> = {
  delay_project: 'Delay',
  pause_project: 'Pause',
  accelerate_project: 'Accelerate',
  remove_project: 'Remove',
};

function macroChipLabel(action: ScenarioAction): string {
  const type = action.action_type as MacroType;
  if (type === 'remove_project') return 'Remove project';
  const params = action.parameters ?? {};
  const n =
    (params.months as number | undefined) ??
    (params.delay_months as number | undefined) ??
    (params.advance_months as number | undefined) ??
    (params.pause_months as number | undefined) ??
    1;
  return `${MACRO_LABEL[type] ?? type} ${n} month${n === 1 ? '' : 's'}`;
}

function clampMonths(raw: string): number {
  const v = Math.round(Number(raw));
  if (Number.isNaN(v)) return 1;
  return Math.min(12, Math.max(1, v));
}

export function MacroStrip({ projectId }: Props) {
  const { detail, applyAction, removeAction } = useScenarioContext();
  const [delayN, setDelayN] = useState('1');
  const [pauseN, setPauseN] = useState('1');
  const [accelN, setAccelN] = useState('1');
  const [pending, setPending] = useState<MacroType | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const activeMacros = (detail?.actions ?? []).filter(
    (a) =>
      a.project_id === projectId &&
      MACRO_TYPES.includes(a.action_type as MacroType),
  );

  // Accelerate clamp note (and any other macro note) lives on the impact
  // dashboard payload. It is not yet in the shared type, so read defensively.
  const macroNotes =
    ((detail?.impact_dashboard as ScenarioImpactDashboard & {
      macro_notes?: string[];
    })?.macro_notes) ?? [];

  const dispatchMacro = async (type: MacroType, months?: number) => {
    setPending(type);
    try {
      await applyAction({
        scope: 'project',
        action_type: type,
        project_id: projectId,
        parameters: months !== undefined ? { months } : {},
        lever_category: 'forecast_grid',
      });
    } finally {
      setPending(null);
    }
  };

  const numericMacro = (
    key: MacroType,
    icon: React.ReactNode,
    value: string,
    setValue: (v: string) => void,
  ) => (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={1}
        max={12}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-14 text-right font-mono"
        aria-label={`${MACRO_LABEL[key]} months`}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={pending !== null}
        onClick={() => dispatchMacro(key, clampMonths(value))}
      >
        {icon}
        <span className="ml-1.5">{MACRO_LABEL[key]}</span>
      </Button>
    </div>
  );

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {numericMacro(
            'delay_project',
            <CalendarClock className="h-3.5 w-3.5" />,
            delayN,
            setDelayN,
          )}
          {numericMacro(
            'pause_project',
            <PauseCircle className="h-3.5 w-3.5" />,
            pauseN,
            setPauseN,
          )}
          {numericMacro(
            'accelerate_project',
            <FastForward className="h-3.5 w-3.5" />,
            accelN,
            setAccelN,
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            disabled={pending !== null}
            onClick={() => setConfirmRemoveOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="ml-1.5">Remove</span>
          </Button>
        </div>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          Macro impact shown after Recalculate
        </span>
      </div>

      {activeMacros.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeMacros.map((a) => (
            <Badge
              key={a.id}
              variant="outline"
              className="gap-1 pr-1 text-xs font-normal"
            >
              {macroChipLabel(a)}
              <button
                type="button"
                aria-label="Remove macro"
                className="ml-0.5 rounded hover:bg-accent p-0.5"
                onClick={() => void removeAction(a.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {macroNotes.length > 0 && (
        <div className="space-y-1">
          {macroNotes.map((note, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1"
            >
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {note}
            </p>
          ))}
        </div>
      )}

      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this project from the scenario?</DialogTitle>
            <DialogDescription>
              This drops the project's contribution from the scenario's impact.
              It affects this scenario only and can be reverted by removing the
              macro chip.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRemoveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending !== null}
              onClick={async () => {
                await dispatchMacro('remove_project');
                setConfirmRemoveOpen(false);
              }}
            >
              Remove project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
