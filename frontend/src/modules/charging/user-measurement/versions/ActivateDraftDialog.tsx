/**
 * UM-draft activation modal per FD-2 / [F-UM-02].
 *
 * Activation freezes a draft into an immutable active version. Unlike Stage 1
 * distribution (which carries an `active_from` effective-date and a rationale),
 * UM activation is a single button: the version is identified by
 * (year, quarter, activated_at) — the activated_at is set on the server at
 * the moment of activation. Historical active versions remain intact for
 * SAP-export reproducibility per spec §2.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CalendarCheck2 } from 'lucide-react';
import { userMeasurementApi } from '@/api/userMeasurement';
import type {
  UMVersionDetailResponse,
  UMVersionSummary,
} from '@/types/userMeasurement';

export interface ActivateDraftDialogProps {
  open: boolean;
  onClose: () => void;
  draft: UMVersionSummary | null;
  /** Currently-active versions for the SAME (year, quarter), surfaced so the
   *  controller knows they're stacking history, not overwriting. */
  siblingActive: UMVersionSummary[];
  onActivated: (detail: UMVersionDetailResponse) => void;
}

export function ActivateDraftDialog({
  open, onClose, draft, siblingActive, onActivated,
}: ActivateDraftDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) return null;

  const handleActivate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const detail = await userMeasurementApi.activateVersion(draft.id);
      onActivated(detail);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Activation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activate draft v{draft.id}</DialogTitle>
          <DialogDescription>
            Activating freezes the version into an immutable record per{' '}
            <span className="font-mono">[F-UM-02]</span>. Cells can no longer
            be edited; create a new draft (copy-from-active) to update going
            forward. Historical versions remain intact for SAP-export
            reproducibility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="bg-accent/40 dark:bg-accent/20 p-3 border-border space-y-1">
            <p className="text-[11px] text-muted-foreground">Draft summary</p>
            <p className="text-sm text-foreground">
              {draft.year}-Q{draft.quarter} · {draft.cell_count} cell
              {draft.cell_count !== 1 ? 's' : ''} · source: {draft.source}
              {draft.copied_from_version_id !== null && (
                <span className="text-muted-foreground">
                  {' '}(copied from v{draft.copied_from_version_id})
                </span>
              )}
            </p>
          </Card>

          {siblingActive.length > 0 && (
            <Card className="border-amber-500/60 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {siblingActive.length} active version
                {siblingActive.length !== 1 ? 's' : ''} already exist for{' '}
                {draft.year}-Q{draft.quarter}. Activating this draft creates a
                new active version on top — historical versions stay intact;
                the resolver picks the latest-activated.
              </p>
            </Card>
          )}

          {error && (
            <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleActivate} disabled={submitting}>
            <CalendarCheck2 className="h-3.5 w-3.5 mr-1" />
            {submitting ? 'Activating…' : 'Activate version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
