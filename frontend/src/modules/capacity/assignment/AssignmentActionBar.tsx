/**
 * AssignmentActionBar — v5.2 W4 Track A (Session 6a).
 *
 * Sticky bottom bar with three actions:
 *   1. "Save draft" — persists assignments without creating Allocations.
 *   2. "Confirm & send to controller" — creates Allocations; disabled until
 *      all months assigned (or shows partial-confirm variant).
 *   3. "Decline" — inline textarea + submit.
 *
 * Transitions: after Confirm/Decline the bar is replaced by a success/decline
 * state card.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.7
 */
import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { capacityApi } from '@/api/endpoints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BarState = 'idle' | 'declining' | 'confirmed' | 'declined' | 'saving';

interface AssignmentActionBarProps {
  projectId: string;
  ccId: string;
  projectName: string;
  isFullyAssigned: boolean;
  isDirty: boolean;
  /** Called when the user clicks "Save draft" — caller is responsible for the API calls */
  onSaveDraft: () => Promise<void>;
  /** Called after a successful confirm — clears overlay + panel */
  onConfirmed: () => void;
  /** Called after a successful decline */
  onDeclined: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssignmentActionBar({
  projectId,
  ccId: _ccId,
  projectName,
  isFullyAssigned,
  isDirty,
  onSaveDraft,
  onConfirmed,
  onDeclined,
}: AssignmentActionBarProps) {
  const [barState, setBarState] = useState<BarState>('idle');
  const [declineReason, setDeclineReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // -------------------------------------------------------------------------
  // Save draft
  // -------------------------------------------------------------------------

  const handleSaveDraft = async () => {
    setBarState('saving');
    setErrorMsg('');
    try {
      await onSaveDraft();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setBarState('idle');
    }
  };

  // -------------------------------------------------------------------------
  // Confirm
  // -------------------------------------------------------------------------

  const handleConfirm = async () => {
    setBarState('saving');
    setErrorMsg('');
    try {
      await capacityApi.confirmProject(projectId);
      setBarState('confirmed');
      onConfirmed();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to confirm project',
      );
      setBarState('idle');
    }
  };

  // -------------------------------------------------------------------------
  // Decline
  // -------------------------------------------------------------------------

  const handleDeclineSubmit = async () => {
    if (!declineReason.trim()) return;
    setBarState('saving');
    setErrorMsg('');
    try {
      await capacityApi.declineProject(projectId, declineReason);
      setBarState('declined');
      onDeclined();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to decline project',
      );
      setBarState('idle');
    }
  };

  // -------------------------------------------------------------------------
  // Confirmed state
  // -------------------------------------------------------------------------

  if (barState === 'confirmed') {
    return (
      <div className="flex flex-col items-center gap-1 rounded-md border border-green-200 bg-green-50 px-3 py-3 dark:border-green-800 dark:bg-green-950/30">
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        <p className="text-center text-xs font-medium text-green-700 dark:text-green-400">
          Confirmed — sent to controller for approval
        </p>
        <p className="text-center text-[11px] text-green-600 dark:text-green-500">
          {projectName}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Declined state
  // -------------------------------------------------------------------------

  if (barState === 'declined') {
    return (
      <div className="flex flex-col items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-3 dark:border-red-800 dark:bg-red-950/30">
        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
        <p className="text-center text-xs font-medium text-red-700 dark:text-red-400">
          Declined
        </p>
        <p className="text-center text-[11px] text-red-600 dark:text-red-500">
          {projectName}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Decline mode (inline textarea)
  // -------------------------------------------------------------------------

  if (barState === 'declining') {
    return (
      <div className="space-y-2">
        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
        )}
        <Textarea
          placeholder="Reason for declining this project…"
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          className="h-20 resize-none text-xs"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="h-7 flex-1 text-xs"
            onClick={handleDeclineSubmit}
            disabled={!declineReason.trim()}
          >
            Submit decline
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => { setBarState('idle'); setDeclineReason(''); }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Idle / saving state — main buttons
  // -------------------------------------------------------------------------

  const isPartial = !isFullyAssigned;
  const confirmLabel = isPartial
    ? 'Confirm partial & send to controller'
    : 'Confirm & send to controller';

  return (
    <div className="space-y-1.5">
      {/* Partial-confirm warning */}
      {isPartial && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          Some months are not fully assigned. The controller will be notified of
          partial fulfillment.
        </p>
      )}

      {errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
      )}

      <div className="flex flex-col gap-1.5">
        {/* Confirm (full or partial) */}
        <Button
          className="h-8 w-full text-xs"
          onClick={handleConfirm}
          disabled={barState === 'saving'}
          title={isPartial ? 'Confirm with partial month assignments' : undefined}
        >
          {confirmLabel}
        </Button>

        <div className="flex gap-1.5">
          {/* Save draft */}
          <Button
            variant="outline"
            className="h-7 flex-1 text-xs"
            onClick={handleSaveDraft}
            disabled={barState === 'saving' || !isDirty}
          >
            {barState === 'saving' ? 'Saving…' : 'Save draft'}
          </Button>

          {/* Decline */}
          <Button
            variant="ghost"
            className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
            onClick={() => setBarState('declining')}
            disabled={barState === 'saving'}
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
