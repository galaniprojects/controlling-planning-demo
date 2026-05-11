/**
 * ApprovalMilestonesTab — fourth Define tab. Owns:
 *   - AI Council screening (`ai_council_approved`, `ai_council_doc_url`).
 *     Buffered via `useDirtyBuffer`; the tab footer Save flushes these
 *     fields through `PUT /api/projects/{id}/approval-milestones`.
 *   - Per-row milestone CRUD (sequence, name, type, baseline_start /
 *     baseline_end, forecast_start / forecast_end, optional colour).
 *     Each milestone row carries its own inline Save / Delete actions and
 *     hits the existing `/api/projects/{id}/milestones` endpoints — this
 *     is intentional: milestones are atomic units with their own
 *     server-side validation (sequence-number uniqueness, baseline-date
 *     override-reason at controller-only), so a per-row Save model is
 *     cleaner than rolling them into the tab-level dirty buffer.
 *   - DoI 3 readiness summary derived from `pipeline.gate_status`.
 *
 * Transformation level lives on the Tech Navigator tab and is therefore
 * intentionally absent here — backend-dev's `ProjectApprovalMilestonesUpdate`
 * accepts it for completeness, but the Approval & Milestones tab does
 * not surface it.
 *
 * Per the team-lead's brief the progress tracker (modules/workbench/
 * progress/*) keeps autosave for demo pacing; this tab uses an explicit
 * Save button and per-row inline Save / Delete actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { milestonesApi } from '@/api/endpoints';
import type {
  MilestoneResponse,
  MilestoneTypeResponse,
} from '@/types/milestones';
import { useDirtyBuffer } from './useDirtyBuffer';
import { defineApi } from './api';
import type { PipelineState } from '@/types/pipeline';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props + helper types
// ---------------------------------------------------------------------------

interface Props {
  /** `null` on `/define/new` — milestones / approval need a persisted row. */
  projectId: string | null;
  /** Currently-loaded canonical state, or null while pipeline loads. */
  pipeline: PipelineState | null;
  /** Whether the persona can edit (controller / PL on own project). */
  readOnly: boolean;
  /** Anchor id requested by the DoI overlay deep-link. */
  focusAnchor: string | null;
  /** Bubble dirty state up for the shell's tab pip. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called after AI Council / milestone changes persist so the parent can re-fetch pipeline. */
  onSaved?: () => void;
}

interface ApprovalBuffer {
  ai_council_approved: boolean;
  ai_council_doc_url: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalMilestonesTab({
  projectId,
  pipeline,
  readOnly,
  focusAnchor,
  onDirtyChange,
  onSaved,
}: Props) {
  // -------------------------------------------------------------------------
  // Approval buffer — AI Council fields
  // -------------------------------------------------------------------------

  // Baseline derived from pipeline state — AI Council fields live there.
  const baseline = useMemo<ApprovalBuffer>(
    () => ({
      ai_council_approved: pipeline?.ai_council_approved ?? false,
      ai_council_doc_url: pipeline?.ai_council_doc_url ?? '',
    }),
    [pipeline?.ai_council_approved, pipeline?.ai_council_doc_url],
  );

  const buffer = useDirtyBuffer<ApprovalBuffer>({
    initial: baseline,
    onSave: async (value) => {
      if (!projectId) return value;
      const trimmedUrl = (value.ai_council_doc_url ?? '').trim();
      await defineApi.updateApprovalMilestones(projectId, {
        ai_council_approved: value.ai_council_approved,
        ai_council_doc_url: trimmedUrl.length > 0 ? trimmedUrl : null,
      });
      onSaved?.();
      return { ...value, ai_council_doc_url: trimmedUrl };
    },
  });

  useEffect(() => {
    onDirtyChange?.(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  // -------------------------------------------------------------------------
  // Milestones list — per-row CRUD against existing milestones router
  // -------------------------------------------------------------------------

  const [milestones, setMilestones] = useState<MilestoneResponse[]>([]);
  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneTypeResponse[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState<boolean>(Boolean(projectId));
  const [milestonesError, setMilestonesError] = useState<string | null>(null);

  const reloadMilestones = useCallback(async () => {
    if (!projectId) return;
    setMilestonesLoading(true);
    setMilestonesError(null);
    try {
      const res = await milestonesApi.list(projectId);
      setMilestones(res.items);
    } catch (e) {
      setMilestonesError(e instanceof Error ? e.message : 'Failed to load milestones');
    } finally {
      setMilestonesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setMilestones([]);
      setMilestonesLoading(false);
      return;
    }
    void reloadMilestones();
  }, [projectId, reloadMilestones]);

  // Catalogue load — once per session.
  useEffect(() => {
    let alive = true;
    milestonesApi
      .listTypes()
      .then((res) => {
        if (!alive) return;
        setMilestoneTypes(res.items.filter((t) => t.is_active));
      })
      .catch(() => {
        if (alive) setMilestoneTypes([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Map for resolving type colour when the milestone has no override.
  const typeMap = useMemo(() => {
    const m = new Map<string, MilestoneTypeResponse>();
    for (const t of milestoneTypes) m.set(t.id, t);
    return m;
  }, [milestoneTypes]);

  // -------------------------------------------------------------------------
  // Focus anchor scroll-into-view
  // -------------------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusAnchor || !containerRef.current) return;
    const el = containerRef.current.querySelector<HTMLElement>(
      `[id="${focusAnchor}"], [data-define-anchor="${focusAnchor}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        if (typeof el.focus === 'function') el.focus();
      }, 200);
    }
  }, [focusAnchor]);

  // -------------------------------------------------------------------------
  // Empty state — /define/new
  // -------------------------------------------------------------------------
  if (!projectId) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-10 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Approval &amp; Milestones unavailable for new projects.
        </p>
        <p className="mt-1">
          Save the project name on the Identity tab first. AI Council approval
          and milestone planning become editable once the project record
          exists.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const v = buffer.value;
  const canSaveApproval = buffer.isDirty && !buffer.saving && !readOnly;

  const currentDoi = pipeline?.gate_status?.current_doi ?? pipeline?.doi ?? null;
  const gateMet = pipeline?.gate_status?.can_advance ?? false;
  const approved = (currentDoi ?? 0) >= 3;

  return (
    <div ref={containerRef} className="space-y-6">
      {/* AI Council card */}
      <section className="rounded-md border border-border bg-card p-4 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            AI Council screening
          </h2>
          <p className="text-xs text-muted-foreground">
            Required before the project can advance to DoI 3 (Approved). Capture
            the approval flag and optionally link the decision document.
          </p>
        </header>

        <div
          className="flex items-start gap-3"
          data-define-anchor="define-anchor-ai-council-approved"
          id="define-anchor-ai-council-approved"
        >
          <Checkbox
            checked={v.ai_council_approved}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              buffer.patch({ ai_council_approved: checked === true })
            }
            id="ai-council-approved"
          />
          <div className="space-y-0.5">
            <label
              htmlFor="ai-council-approved"
              className="text-sm font-medium text-foreground"
            >
              AI Council approval received
            </label>
            <p className="text-xs text-muted-foreground">
              Tick once the council has cleared the project. Controllers can
              advance the DoI to 3 once this and the other DoI 3 requirements
              are met.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="ai-council-doc-url"
            className="text-sm font-medium text-foreground"
          >
            Approval document URL
          </label>
          <Input
            id="ai-council-doc-url"
            type="url"
            value={v.ai_council_doc_url ?? ''}
            onChange={(e) =>
              buffer.patch({ ai_council_doc_url: e.target.value })
            }
            placeholder="https://wiki.example.com/ai-council/decisions/..."
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Surfaced on the project header so reviewers can jump to
            the decision record.
          </p>
        </div>
      </section>

      {/* DoI 3 readiness card */}
      <section
        className={cn(
          'rounded-md border p-4 space-y-2',
          approved
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            : gateMet
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
              : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
        )}
      >
        <header className="flex items-center gap-2">
          {approved ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : gateMet ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
          )}
          <h3 className="text-sm font-semibold text-foreground">
            {approved
              ? 'Project approved — ready for execution'
              : gateMet
                ? 'Ready to advance to the next DoI level'
                : `DoI ${currentDoi ?? 0} → ${pipeline?.gate_status?.next_doi ?? '?'} pending`}
          </h3>
        </header>
        <p className="text-xs text-foreground/80">
          {approved
            ? 'Switch to the Workbench via the header action to plan the operational forecast.'
            : gateMet
              ? 'All DoI requirements are satisfied. Use the pipeline transition in the Backlog to advance, or have a controller advance from this page.'
              : pipeline?.gate_status?.missing_fields &&
                pipeline.gate_status.missing_fields.length > 0
                ? `Still missing: ${pipeline.gate_status.missing_fields.join(', ')}.`
                : 'Awaiting more data before the gate can be evaluated.'}
        </p>
      </section>

      {/* Milestones list */}
      <section className="rounded-md border border-border bg-card p-4 space-y-3">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Milestones
          </h2>
          <p className="text-xs text-muted-foreground">
            Sequence-numbered checkpoints with baseline + forecast date ranges.
            Baseline-date edits are controller-only and require a reason. Each
            row saves independently.
          </p>
        </header>

        {milestonesError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {milestonesError}
          </div>
        ) : null}

        {milestonesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : milestones.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No milestones yet. Add the first checkpoint below.
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Milestone list">
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                projectId={projectId}
                milestone={m}
                types={milestoneTypes}
                typeMap={typeMap}
                readOnly={readOnly}
                onSaved={(updated) => {
                  setMilestones((prev) =>
                    prev.map((r) => (r.id === updated.id ? updated : r)),
                  );
                  onSaved?.();
                }}
                onDeleted={(id) => {
                  setMilestones((prev) => prev.filter((r) => r.id !== id));
                  onSaved?.();
                }}
              />
            ))}
          </ul>
        )}

        {!readOnly ? (
          <AddMilestoneForm
            projectId={projectId}
            types={milestoneTypes}
            nextSequence={
              milestones.length === 0
                ? 1
                : Math.max(...milestones.map((m) => m.sequence_number)) + 1
            }
            onCreated={(m) => {
              setMilestones((prev) =>
                [...prev, m].sort((a, b) => a.sequence_number - b.sequence_number),
              );
              onSaved?.();
            }}
          />
        ) : null}
      </section>

      {/* Footer Save — AI Council fields only. Milestone rows save inline. */}
      <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-background/95 backdrop-blur-sm border-t border-border flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground min-h-[1.25rem]">
          {buffer.saving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Saving AI Council…
            </span>
          ) : buffer.error ? (
            <span className="text-destructive">{buffer.error}</span>
          ) : buffer.isDirty ? (
            <span>Unsaved AI Council changes.</span>
          ) : (
            <span>
              AI Council saved. Milestone rows save inline as you edit them.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!buffer.isDirty || buffer.saving}
            onClick={buffer.reset}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!canSaveApproval}
            onClick={() => {
              void buffer.save().catch(() => {
                /* error surfaced via buffer.error */
              });
            }}
          >
            <Save className="size-4" aria-hidden />
            Save AI Council
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MilestoneRow — view + inline edit
// ---------------------------------------------------------------------------

interface MilestoneRowProps {
  projectId: string;
  milestone: MilestoneResponse;
  types: MilestoneTypeResponse[];
  typeMap: Map<string, MilestoneTypeResponse>;
  readOnly: boolean;
  onSaved: (updated: MilestoneResponse) => void;
  onDeleted: (id: number) => void;
}

function MilestoneRow({
  projectId,
  milestone,
  types,
  typeMap,
  readOnly,
  onSaved,
  onDeleted,
}: MilestoneRowProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    const colour = milestone.color
      ?? (milestone.milestone_type_id
        ? typeMap.get(milestone.milestone_type_id)?.default_color
        : null);
    return (
      <li className="rounded-md border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-3">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: colour ?? 'var(--muted-foreground)' }}
            aria-hidden
          />
          <span className="text-xs text-muted-foreground tabular-nums w-6">
            #{milestone.sequence_number}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {milestone.name}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Baseline {milestone.baseline_start} → {milestone.baseline_end} ·
              Forecast {milestone.forecast_start} → {milestone.forecast_end}
              {milestone.slip_months !== 0 ? (
                <span
                  className={cn(
                    'ml-2 font-medium',
                    milestone.slip_months > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {milestone.slip_months > 0
                    ? `+${milestone.slip_months}M slip`
                    : `${milestone.slip_months}M ahead`}
                </span>
              ) : null}
            </div>
          </div>
          {!readOnly ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/10 p-3">
      <MilestoneForm
        mode="edit"
        projectId={projectId}
        types={types}
        initial={milestone}
        onComplete={(updated) => {
          if (updated === 'cancel') {
            setEditing(false);
            return;
          }
          if (updated === 'delete') {
            onDeleted(milestone.id);
            setEditing(false);
            return;
          }
          onSaved(updated);
          setEditing(false);
        }}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// AddMilestoneForm — create at end of list
// ---------------------------------------------------------------------------

interface AddMilestoneFormProps {
  projectId: string;
  types: MilestoneTypeResponse[];
  nextSequence: number;
  onCreated: (m: MilestoneResponse) => void;
}

function AddMilestoneForm({
  projectId,
  types,
  nextSequence,
  onCreated,
}: AddMilestoneFormProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full justify-center"
      >
        <Plus className="size-4" aria-hidden />
        Add milestone
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
      <MilestoneForm
        mode="create"
        projectId={projectId}
        types={types}
        initial={{
          sequence_number: nextSequence,
          name: '',
          milestone_type_id: null,
          baseline_start: '',
          baseline_end: '',
          forecast_start: '',
          forecast_end: '',
          color: null,
        }}
        onComplete={(result) => {
          if (result === 'cancel' || result === 'delete') {
            setOpen(false);
            return;
          }
          onCreated(result);
          setOpen(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MilestoneForm — shared edit / create form
// ---------------------------------------------------------------------------

type MilestoneFormResult =
  | MilestoneResponse
  | 'cancel'
  | 'delete';

interface MilestoneFormInitial {
  id?: number;
  sequence_number: number;
  name: string;
  milestone_type_id: string | null;
  baseline_start: string;
  baseline_end: string;
  forecast_start: string;
  forecast_end: string;
  color: string | null;
}

interface MilestoneFormProps {
  mode: 'create' | 'edit';
  projectId: string;
  types: MilestoneTypeResponse[];
  initial: MilestoneFormInitial;
  onComplete: (result: MilestoneFormResult) => void;
}

function MilestoneForm({
  mode,
  projectId,
  types,
  initial,
  onComplete,
}: MilestoneFormProps) {
  const [seq, setSeq] = useState<number>(initial.sequence_number);
  const [name, setName] = useState(initial.name);
  const [typeId, setTypeId] = useState<string | null>(initial.milestone_type_id);
  const [baselineStart, setBaselineStart] = useState(initial.baseline_start);
  const [baselineEnd, setBaselineEnd] = useState(initial.baseline_end);
  const [forecastStart, setForecastStart] = useState(initial.forecast_start);
  const [forecastEnd, setForecastEnd] = useState(initial.forecast_end);
  const [color, setColor] = useState<string>(initial.color ?? '');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect baseline-date changes vs initial → require override_reason.
  const baselineTouched =
    mode === 'edit' &&
    (baselineStart !== initial.baseline_start ||
      baselineEnd !== initial.baseline_end);

  const canSubmit =
    name.trim().length > 0 &&
    /^\d{4}-\d{2}$/.test(baselineStart) &&
    /^\d{4}-\d{2}$/.test(baselineEnd) &&
    /^\d{4}-\d{2}$/.test(forecastStart) &&
    /^\d{4}-\d{2}$/.test(forecastEnd) &&
    seq > 0 &&
    (!baselineTouched || overrideReason.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const created = await milestonesApi.create(projectId, {
          sequence_number: seq,
          name: name.trim(),
          milestone_type_id: typeId,
          baseline_start: baselineStart,
          baseline_end: baselineEnd,
          forecast_start: forecastStart,
          forecast_end: forecastEnd,
          color: color.trim() || null,
        });
        onComplete(created);
      } else {
        const updated = await milestonesApi.update(projectId, initial.id!, {
          sequence_number: seq,
          name: name.trim(),
          milestone_type_id: typeId,
          baseline_start: baselineStart,
          baseline_end: baselineEnd,
          forecast_start: forecastStart,
          forecast_end: forecastEnd,
          color: color.trim() || null,
          override_reason: baselineTouched ? overrideReason.trim() : null,
        });
        onComplete(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!initial.id) return;
    if (!window.confirm(`Delete milestone "${initial.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await milestonesApi.remove(projectId, initial.id);
      onComplete('delete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
        <div className="sm:col-span-1 space-y-1">
          <label className="text-xs font-medium text-foreground">Seq</label>
          <Input
            type="number"
            min={1}
            value={seq}
            onChange={(e) => setSeq(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="sm:col-span-3 space-y-1">
          <label className="text-xs font-medium text-foreground">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Milestone name"
            maxLength={100}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="text-xs font-medium text-foreground">Type</label>
          <Select
            value={typeId ?? '__none__'}
            onValueChange={(v) => setTypeId(v === '__none__' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Baseline start
          </label>
          <Input
            type="month"
            value={baselineStart}
            onChange={(e) => setBaselineStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Baseline end
          </label>
          <Input
            type="month"
            value={baselineEnd}
            onChange={(e) => setBaselineEnd(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Forecast start
          </label>
          <Input
            type="month"
            value={forecastStart}
            onChange={(e) => setForecastStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Forecast end
          </label>
          <Input
            type="month"
            value={forecastEnd}
            onChange={(e) => setForecastEnd(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            Colour override (optional)
          </label>
          <Input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#e0a000 or leave blank to inherit from type"
            maxLength={20}
          />
        </div>
      </div>

      {baselineTouched ? (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
          <label className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Baseline change reason (required — controller only)
          </label>
          <Input
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why is the baseline shifting?"
          />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          {mode === 'edit' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onComplete('cancel')}
            disabled={busy}
          >
            <XCircle className="size-4" aria-hidden />
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit || busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4" aria-hidden />
                {mode === 'create' ? 'Add milestone' : 'Save row'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
