/**
 * PipelineTransitionMenu — controller stage-transition controls
 * [A-PS-07] [A-PS-08] [A-PS-10] [A-PS-11] [A-BK-30].
 *
 * Renders a "Stage" dropdown when the current user is a controller. The menu
 * presents three groups:
 *
 * 1. Forward / lateral on-path moves (the API-allowed ``transitions_available``).
 * 2. Hold actions — Pause / Reactivate (only when not already in an off-path
 *    stage / when in a Paused stage).
 * 3. Cancel / Re-open Cancelled — Cancel always available; un-cancel surfaces
 *    when current stage is Cancelled, with an override-reason prompt.
 *
 * Off-path transitions (leaving Cancelled, crossing failed DoI gates) require
 * an ``override_reason`` per [A-PS-10] / [A-BK-30] — a small dialog collects
 * it before posting.
 */

import { useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { pipelineApi } from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import type { PipelineState } from '@/types/pipeline';
import { OFF_PATH_STAGES } from '@/lib/pipelineStages';

interface Props {
  projectId: string;
  state: PipelineState | null;
  onChanged?: (next: PipelineState) => void;
  size?: 'sm' | 'default';
}

/** Render a transition error readably.
 *
 * Gate 409s ship a structured detail (`{error, missing_fields, ...}`) that
 * `client.ts` stringifies into `err.message`; parse it back so the override
 * dialog shows the missing-field list, not a raw JSON blob. */
function readableTransitionError(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'Transition failed';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.missing_fields) && parsed.missing_fields.length) {
      return `Cannot advance yet — missing: ${parsed.missing_fields.join(', ')}.`;
    }
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch {
    /* not JSON — fall through to the raw string */
  }
  return raw;
}

export function PipelineTransitionMenu({
  projectId,
  state,
  onChanged,
  size = 'sm',
}: Props) {
  const { context } = useRole();
  const role = context?.role;
  const [pendingTransition, setPendingTransition] = useState<{
    target_stage: string;
    label: string;
    requiresReason: boolean;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role !== 'controller' || !state) return null;

  const currentStage = state.pipeline_stage;
  const transitions = state.transitions_available ?? [];
  const inOffPath =
    currentStage !== null && OFF_PATH_STAGES.has(currentStage as never);

  const onPathTargets = transitions.filter(
    (t) => t !== 'Paused' && t !== 'Cancelled',
  );
  const canPause = transitions.includes('Paused');
  const canCancel = transitions.includes('Cancelled');

  function open(target: string, label: string, requiresReason: boolean) {
    setOverrideReason('');
    setError(null);
    if (requiresReason) {
      setPendingTransition({ target_stage: target, label, requiresReason });
    } else {
      void doTransition(target, undefined);
    }
  }

  async function doTransition(target: string, reason: string | undefined) {
    setSubmitting(true);
    setError(null);
    try {
      const next = await pipelineApi.transition(projectId, {
        target_stage: target,
        override_reason: reason,
      });
      onChanged?.(next);
      setPendingTransition(null);
    } catch (e) {
      setError(readableTransitionError(e));
      // A direct (no-reason) transition that fails — e.g. a stage-entry or
      // DoI gate block — would otherwise show its error inside the now-closed
      // dropdown. Surface it in the override dialog so the user can see why and
      // optionally override with a reason.
      if (reason === undefined && !pendingTransition) {
        setPendingTransition({
          target_stage: target,
          label: `Move to ${target}`,
          requiresReason: true,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} className="gap-1.5">
            Stage <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Current: {currentStage ?? '—'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {onPathTargets.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Move stage
              </DropdownMenuLabel>
              {onPathTargets.map((target) => (
                <DropdownMenuItem
                  key={target}
                  onSelect={() => open(target, target, false)}
                >
                  → {target}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Hold / cancel
          </DropdownMenuLabel>
          {canPause ? (
            <DropdownMenuItem onSelect={() => open('Paused', 'Pause', false)}>
              Pause
            </DropdownMenuItem>
          ) : null}
          {inOffPath && currentStage === 'Paused' ? (
            <DropdownMenuItem
              onSelect={() => open('Active', 'Reactivate to Active', false)}
            >
              Reactivate
            </DropdownMenuItem>
          ) : null}
          {canCancel ? (
            <DropdownMenuItem
              onSelect={() => open('Cancelled', 'Cancel project', true)}
              className="text-red-600 dark:text-red-400 focus:text-red-700"
            >
              Cancel project…
            </DropdownMenuItem>
          ) : null}
          {currentStage === 'Cancelled' ? (
            <DropdownMenuItem
              onSelect={() =>
                open('Under Evaluation', 'Re-open as Under Evaluation', true)
              }
            >
              Re-open project…
            </DropdownMenuItem>
          ) : null}

          {!state.gate_status.can_advance &&
          state.gate_status.next_doi !== null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Gate {state.gate_status.next_doi} blocked
              </DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <AlertTriangle className="size-3.5 mr-1.5" aria-hidden />
                Missing fields prevent advance
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Override-reason dialog */}
      <Dialog
        open={!!pendingTransition}
        onOpenChange={(o) => !o && setPendingTransition(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingTransition?.label}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a brief reason — this is recorded in the audit log per
            [A-PS-10] / [A-BK-30].
          </p>
          <Textarea
            placeholder="Reason for override…"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={3}
          />
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingTransition(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting || overrideReason.trim().length === 0}
              onClick={() =>
                pendingTransition
                  ? doTransition(
                      pendingTransition.target_stage,
                      overrideReason.trim(),
                    )
                  : undefined
              }
            >
              {submitting ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
