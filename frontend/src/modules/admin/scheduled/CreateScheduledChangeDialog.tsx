/**
 * CreateScheduledChangeDialog — Item 9 (demo polish follow-ups).
 *
 * Closes the documented W10.6 gap: backend lifecycle for
 * ``ScheduledChange`` is fully wired (create / approve / reject / cancel /
 * activate) but the admin UI lacked a Create form. Today an admin had to
 * curl the endpoint to schedule a future planning-parameter change.
 *
 * Scope decisions
 * ---------------
 * - **Entity type**: only ``planning_parameter`` is enabled. The activation
 *   engine in ``services/scheduled_change_activation.py`` only ships a
 *   handler for that type in v5; other types (``rate_table``, ``cost_center``,
 *   etc.) record activation as a no-op. We surface them as disabled options
 *   with a "Coming soon" tooltip so the demo communicates the roadmap
 *   without misleading the operator.
 * - **Parameter source**: pulls from ``GET /api/admin/parameters`` via
 *   ``adminApi.getParameters()`` — same endpoint the Planning Parameters
 *   admin panel uses, so the picker reflects exactly what's editable today.
 * - **pending_values shape**: the activation handler reads ``current_value``
 *   from the dict (see ``_apply_planning_parameter`` in
 *   ``services/scheduled_change_activation.py``). The dialog therefore
 *   serialises the new value as ``{"current_value": "<string>"}`` so the
 *   end-to-end flow (create → approve → apply) actually mutates the live
 *   parameter row.
 * - **Activation date**: ``min`` is set to today; the backend re-validates
 *   so a stale form can't sneak in a past date.
 * - **Justification**: required, ≥ 20 chars (a soft demo guardrail mirroring
 *   the textual hint in W10.6). Submitted as the schema's ``description``
 *   field.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { adminApi, adminD3Api } from '@/api/endpoints';
import type { AdminParameter } from '@/types/api';

const MIN_JUSTIFICATION_CHARS = 20;
const MAX_DESCRIPTION_CHARS = 255;

interface EntityTypeOption {
  value: string;
  label: string;
  enabled: boolean;
  hint?: string;
}

const ENTITY_TYPE_OPTIONS: EntityTypeOption[] = [
  { value: 'planning_parameter', label: 'Planning parameter', enabled: true },
  { value: 'rate_table',         label: 'Rate table',         enabled: false, hint: 'Coming soon — not wired in v5' },
  { value: 'cost_center',        label: 'Cost center',        enabled: false, hint: 'Coming soon — not wired in v5' },
  { value: 'role_type',          label: 'Role type',          enabled: false, hint: 'Coming soon — not wired in v5' },
  { value: 'person',             label: 'Person',             enabled: false, hint: 'Coming soon — not wired in v5' },
  { value: 'competence_center',  label: 'Competence center',  enabled: false, hint: 'Coming soon — not wired in v5' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isNumericValue(value: string): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !Number.isNaN(Number(value));
}

export function CreateScheduledChangeDialog({ open, onOpenChange, onCreated }: Props) {
  const [entityType, setEntityType] = useState<string>('planning_parameter');
  const [paramKey, setParamKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');
  const [activationDate, setActivationDate] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [parameters, setParameters] = useState<AdminParameter[]>([]);
  const [loadingParams, setLoadingParams] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when dialog opens; load parameters once per open.
  useEffect(() => {
    if (!open) return;
    setEntityType('planning_parameter');
    setParamKey('');
    setNewValue('');
    setActivationDate('');
    setJustification('');
    setError(null);
    setLoadingParams(true);
    adminApi
      .getParameters()
      .then((res) => setParameters(res.items ?? []))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load parameters';
        setError(msg);
        setParameters([]);
      })
      .finally(() => setLoadingParams(false));
  }, [open]);

  const selectedParameter = useMemo(
    () => parameters.find((p) => p.key === paramKey) ?? null,
    [parameters, paramKey],
  );

  // Type-aware validation: numeric if the parameter's current value is
  // numeric, otherwise plain string. Default to text if no parameter
  // selected yet.
  const valueIsNumeric = selectedParameter
    ? isNumericValue(selectedParameter.current_value)
    : false;
  const valueValid =
    newValue.trim().length > 0 &&
    (!valueIsNumeric || isNumericValue(newValue.trim()));
  const valueError =
    newValue.trim().length === 0
      ? null
      : valueIsNumeric && !isNumericValue(newValue.trim())
      ? 'Numeric value required for this parameter'
      : null;

  const justifLen = justification.trim().length;
  const justificationValid =
    justifLen >= MIN_JUSTIFICATION_CHARS &&
    justifLen <= MAX_DESCRIPTION_CHARS;

  const dateValid =
    activationDate.length === 10 && activationDate >= todayISO();

  const canSubmit =
    !submitting &&
    entityType === 'planning_parameter' &&
    !!selectedParameter &&
    valueValid &&
    dateValid &&
    justificationValid;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedParameter) return;
    setSubmitting(true);
    setError(null);
    try {
      await adminD3Api.createScheduledChange({
        entity_type: entityType,
        entity_id: selectedParameter.key,
        description: justification.trim(),
        // Activation handler reads ``current_value`` from the dict, so we
        // serialise the new value under that key. Stored as a string to
        // match how PlanningParameter.current_value is persisted.
        pending_values: { current_value: newValue.trim() },
        activation_date: activationDate,
      });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create scheduled change';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New scheduled change</DialogTitle>
          <DialogDescription>
            Schedule a future-dated change to a planning parameter. The change
            enters the queue at <span className="font-medium text-foreground">pending review</span>;
            a second controller approves before it becomes eligible for activation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entity type ------------------------------------------------- */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground">Entity type</label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPE_OPTIONS.map((opt) =>
                  opt.enabled ? (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ) : (
                    <Tooltip key={opt.value}>
                      <TooltipTrigger asChild>
                        <div>
                          <SelectItem value={opt.value} disabled>
                            <span className="text-muted-foreground">{opt.label}</span>
                          </SelectItem>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">{opt.hint}</TooltipContent>
                    </Tooltip>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Only planning parameters are wired through to the live entity in v5.
              Other entity types will be enabled as activation handlers ship.
            </p>
          </div>

          {/* Parameter --------------------------------------------------- */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground">Parameter</label>
            <Select
              value={paramKey}
              onValueChange={(v) => { setParamKey(v); setNewValue(''); }}
              disabled={loadingParams || parameters.length === 0}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue
                  placeholder={loadingParams ? 'Loading parameters…' : 'Select a parameter'}
                />
              </SelectTrigger>
              <SelectContent>
                {parameters.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    <span className="flex flex-col">
                      <span className="text-sm text-foreground">{p.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {p.key} = {p.current_value}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedParameter && (
              <p className="text-[11px] text-muted-foreground">
                Current value:{' '}
                <span className="font-mono text-foreground">{selectedParameter.current_value}</span>
                {' '}
                <span className="text-muted-foreground">
                  ({selectedParameter.data_type})
                </span>
              </p>
            )}
          </div>

          {/* New value --------------------------------------------------- */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground">New value</label>
            <Input
              type={valueIsNumeric ? 'number' : 'text'}
              step={valueIsNumeric ? 'any' : undefined}
              className="h-9 text-sm"
              placeholder={
                selectedParameter
                  ? `e.g. ${selectedParameter.current_value}`
                  : 'Select a parameter first'
              }
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={!selectedParameter}
            />
            {valueError && (
              <p className="text-xs text-red-600 dark:text-red-400">{valueError}</p>
            )}
          </div>

          {/* Activation date --------------------------------------------- */}
          <div className="space-y-1.5">
            <label className="text-sm text-foreground">Activation date</label>
            <Input
              type="date"
              className="h-9 text-sm"
              min={todayISO()}
              value={activationDate}
              onChange={(e) => setActivationDate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Must be today or later. Approved changes activate on this date when
              the daily job (or "Apply due changes") runs.
            </p>
          </div>

          {/* Justification ----------------------------------------------- */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-foreground">
                Justification <span className="text-red-600">*</span>
              </label>
              <span
                className={
                  justifLen > MAX_DESCRIPTION_CHARS
                    ? 'text-xs text-red-600 dark:text-red-400'
                    : justifLen >= MIN_JUSTIFICATION_CHARS
                    ? 'text-xs text-muted-foreground'
                    : 'text-xs text-muted-foreground'
                }
              >
                {justifLen} / {MAX_DESCRIPTION_CHARS}
                {justifLen < MIN_JUSTIFICATION_CHARS && ` (min ${MIN_JUSTIFICATION_CHARS})`}
              </span>
            </div>
            <Textarea
              rows={3}
              maxLength={MAX_DESCRIPTION_CHARS + 50}
              placeholder="Why is this change being scheduled? Reference board guidance, audit ticket, etc."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {submitting ? 'Submitting…' : 'Schedule change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
