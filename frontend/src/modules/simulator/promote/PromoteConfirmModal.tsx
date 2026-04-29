/**
 * v5 B2 [B-PR-04] — PromoteConfirmModal.
 *
 * Final confirm step before executing a Promote. Shows a summary of how
 * many diffs will be applied, optional notes textarea (recorded on the
 * `ScenarioPromotion` audit row), and an Execute button. Aware that
 * partial promotion is supported — un-selected diffs remain editable.
 *
 * Calls `useScenarioContext().promoteExecute(actionIds, notes)` on
 * confirm. The PromoteReviewPage owns the response navigation.
 */

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useScenarioContext } from '../useScenarioContext';
import type { PromoteExecuteResponse } from '../api/scenariosApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: number[];
  /** Called once the promote has executed successfully. */
  onComplete: (result: PromoteExecuteResponse) => void;
  /** How many decisions are visible in total (informational copy). */
  totalDecisions: number;
}

export function PromoteConfirmModal({
  open,
  onOpenChange,
  selectedIds,
  onComplete,
  totalDecisions,
}: Props) {
  const { promoteExecute } = useScenarioContext();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await promoteExecute({
        action_ids: selectedIds.length > 0 ? selectedIds : undefined,
        notes: notes.trim() || undefined,
      });
      onComplete(result);
      setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const skipped = totalDecisions - selectedIds.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm promotion</DialogTitle>
          <DialogDescription>
            Selected diffs will be routed through their native workflows. Un-selected
            diffs remain in the scenario, untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Promoting</span>
              <span className="font-semibold text-foreground">
                {selectedIds.length} diff{selectedIds.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leaving in scenario</span>
              <span className="font-semibold text-foreground">
                {skipped} diff{skipped === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you promoting now? Audit log captures this verbatim."
              rows={3}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExecute}
            disabled={submitting || selectedIds.length === 0}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Execute promotion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
