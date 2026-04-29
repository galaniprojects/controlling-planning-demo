/**
 * v5 B2 [B-SL-02] — Rebase confirmation modal.
 *
 * Rebase re-anchors a scenario to a newer forecast cycle. The demo
 * doesn't expose explicit cycle picking — we let the user confirm
 * the rebase intent and let the backend default to the most recent
 * cycle. (Manual + explicit per spec; this UI captures the explicit
 * confirmation gate.)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioName: string;
  currentAnchorVersionId: number | null;
  onConfirm: (newAnchorVersionId: number) => Promise<void>;
}

export function RebaseModal({
  open,
  onOpenChange,
  scenarioName,
  currentAnchorVersionId,
  onConfirm,
}: Props) {
  const [versionIdInput, setVersionIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    const id = Number.parseInt(versionIdInput, 10);
    if (!Number.isFinite(id) || id <= 0) {
      setError('Please enter a valid forecast version id');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(id);
      setVersionIdInput('');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rebase failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Rebase Scenario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-foreground">
            Re-anchor <span className="font-medium">{scenarioName}</span> to
            a newer forecast cycle. All diffs are carried forward unchanged;
            you'll resolve any conflicts in the workspace afterwards.
          </p>
          <p className="text-xs text-muted-foreground">
            Current anchor:{' '}
            <span className="font-tabular">
              {currentAnchorVersionId ?? 'none'}
            </span>
          </p>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              New anchor version id
            </label>
            <Input
              value={versionIdInput}
              onChange={(e) => setVersionIdInput(e.target.value)}
              placeholder="e.g., 12"
              type="number"
              min={1}
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              This action records a rebase event. The anchor change is
              permanent until the next rebase.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Rebasing...' : 'Rebase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
