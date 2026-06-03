/**
 * Activation modal for a draft `DistributionVersion` per FD-3
 * [F-S1-02][F-S1-03][F-S1-08]:
 *
 * - `active_from` is required (the effective-date anchor). Allows future
 *   dates per `[F-S1-03]` (prepare-ahead: dormant until that date).
 * - `rationale` is required (non-empty). Defaults to the draft rationale
 *   if any; controller may polish before confirming.
 *
 * Service rejects (409) on duplicate `active_from` across production
 * active versions, empty rationale, or activation of a scenario-scoped
 * version (the cost-allocation sandbox never activates).
 *
 * Demo date is **April 2026** per CLAUDE.md — the date input defaults
 * to today (`new Date().toISOString().slice(0, 10)`) which the runtime
 * supplies; the warning copy below references that anchor.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { AlertCircle, CalendarCheck2 } from 'lucide-react';
import { chargingApi } from '@/api/endpoints';
import type {
  DistributionVersionDetailResponse,
  DistributionVersionResponse,
} from '@/types/api';
import { formatVersionDate } from './versionLabels';

export interface ActivateVersionDialogProps {
  open: boolean;
  onClose: () => void;
  /** The draft being activated. */
  draft: DistributionVersionDetailResponse | null;
  /** Existing active production versions — used to render conflict hints
   *  client-side; backend remains the authority (409 on conflict). */
  activeVersions: DistributionVersionResponse[];
  onActivated: (activated: DistributionVersionResponse) => void;
}

function todayIso(): string {
  // Local-time date string `YYYY-MM-DD` — matches the `<input type="date">` shape.
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ActivateVersionDialog({
  open,
  onClose,
  draft,
  activeVersions,
  onActivated,
}: ActivateVersionDialogProps) {
  const [activeFrom, setActiveFrom] = useState<string>('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && draft) {
      setActiveFrom(draft.version.active_from ?? todayIso());
      setRationale(draft.version.rationale ?? '');
      setError(null);
      setSubmitting(false);
    } else if (!open) {
      setActiveFrom('');
      setRationale('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, draft]);

  if (!draft) return null;

  // Client-side hint — backend is the authority.
  const duplicateConflict = activeVersions.find(
    (v) => v.active_from === activeFrom && v.id !== draft.version.id,
  );

  const handleActivate = async () => {
    const trimmedRationale = rationale.trim();
    if (!activeFrom) {
      setError('Pick an active_from date.');
      return;
    }
    if (!trimmedRationale) {
      setError('Rationale is required at activation.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const activated = await chargingApi.activateDistributionVersion(
        draft.version.id,
        { active_from: activeFrom, rationale: trimmedRationale },
      );
      onActivated(activated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Activation failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const today = todayIso();
  const isFuture = activeFrom > today;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activate version v{draft.version.id}</DialogTitle>
          <DialogDescription>
            Flip this draft into the production timeline. The version becomes
            in-force on its <span className="font-mono">active_from</span> date
            and is immutable thereafter per{' '}
            <span className="font-mono">[F-S1-08]</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-accent/40 dark:bg-accent/20 p-3 border-border space-y-1">
            <p className="text-[11px] text-muted-foreground">Draft summary</p>
            <p className="text-sm text-foreground">
              {draft.total_edges} edge{draft.total_edges !== 1 ? 's' : ''} ·{' '}
              origin: {draft.version.origin}
              {draft.version.copied_from_version_id !== null && (
                <span className="text-muted-foreground">
                  {' '}(copied from v{draft.version.copied_from_version_id})
                </span>
              )}
            </p>
          </Card>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Active from
            </label>
            <Input
              type="date"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
              className="h-9 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Per <span className="font-mono">[F-S1-02]</span>: in-force version
              is the latest <span className="font-mono">active_from ≤ date</span>.
              {isFuture ? (
                <>
                  {' '}
                  This is a future date — the version stays dormant until then
                  (prepare-ahead per{' '}
                  <span className="font-mono">[F-S1-03]</span>).
                </>
              ) : (
                <> Today or earlier — version becomes in-force immediately.</>
              )}
            </p>
            {duplicateConflict && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Another active version (v{duplicateConflict.id}) already uses{' '}
                {formatVersionDate(activeFrom)}. Pick a different date — the
                resolver does not tie-break.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rationale <span className="font-normal normal-case">(required)</span>
            </label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What changed and why — the audit record going forward."
              rows={3}
              maxLength={4000}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Per <span className="font-mono">[F-S1-05]</span>: required at
              activation; supersedes the draft rationale if edited.
            </p>
          </div>

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
          <Button
            onClick={handleActivate}
            disabled={
              submitting || !activeFrom || !rationale.trim() || !!duplicateConflict
            }
          >
            <CalendarCheck2 className="h-3.5 w-3.5 mr-1" />
            {submitting ? 'Activating…' : 'Activate version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
