/**
 * v5 B2 [B-PR-05] [B-OQ-02] — Apply-to-forecast confirmation modal.
 *
 * Two phases:
 *  1. confirm — user reviews scope (own-project diffs only) and clicks Apply.
 *  2. result — modal swaps to a summary of carried / skipped diffs.
 *
 * Provenance is communicated via Cluster C's Forecast.is_provisional
 * flag; the modal surfaces the backend's provenance_note verbatim.
 */

import { useState } from 'react';
import { ArrowDownToLine, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/api/client';
import { useScenarioContext } from '../useScenarioContext';
import { RebaseModal } from '../manager/RebaseModal';
import type { ApplyToForecastResponse } from '../api/scenariosApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplyConfirmModal({ open, onOpenChange }: Props) {
  const ctx = useScenarioContext();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApplyToForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Simulator S4 — stale-anchor guard (§10). A 409 from apply-to-forecast
  // means the scenario's anchor is out of date and must be rebased before
  // it can seed the live forecast cycle.
  const [staleAnchor, setStaleAnchor] = useState(false);
  const [rebaseOpen, setRebaseOpen] = useState(false);

  const handleClose = () => {
    setResult(null);
    setError(null);
    setStaleAnchor(false);
    onOpenChange(false);
  };

  const handleApply = async () => {
    setSubmitting(true);
    setError(null);
    setStaleAnchor(false);
    try {
      const res = await ctx.applyToForecast();
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStaleAnchor(true);
      } else {
        setError(e instanceof Error ? e.message : 'Apply failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRebaseConfirm = async (newAnchorVersionId: number) => {
    await ctx.rebase(newAnchorVersionId);
    // Anchor refreshed — clear the guard so the user can retry Apply.
    setStaleAnchor(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {result
              ? 'Apply complete'
              : staleAnchor
                ? 'Anchor is out of date'
                : 'Apply scenario to forecast'}
          </DialogTitle>
        </DialogHeader>

        {staleAnchor ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 text-sm text-foreground">
              <AlertTriangle
                className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <p>
                This scenario is anchored to a forecast cycle that has since
                moved on. Applying now would seed your live forecast from an
                out-of-date baseline. Rebase the scenario to the current cycle
                first, then apply.
              </p>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
              Rebasing carries your diffs forward unchanged onto the newer
              anchor. You can resolve any conflicts in the workspace before
              re-applying.
            </p>
          </div>
        ) : !result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 text-sm text-foreground">
              <ArrowDownToLine
                className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p>
                Carry diffs from this published scenario forward into your
                live forecast. Only diffs on projects you own will be carried;
                cross-project diffs and Stage 1 / Stage 2 charging changes are
                skipped.
              </p>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
              Carried cells are flagged as <em>provisional</em> in the
              Workbench grid. They remain editable and become canonical when
              you submit your next forecast cycle.
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-border p-2">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Carried forward
                </div>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {result.diffs_carried_forward}
                </p>
              </div>
              <div className="rounded border border-border p-2">
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Skipped
                </div>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {result.diffs_skipped}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.provenance_note}
            </p>
            {result.summary.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-border rounded">
                <ul className="divide-y divide-border">
                  {result.summary.map((item) => (
                    <li
                      key={item.action_id}
                      className="px-2 py-1.5 text-xs flex justify-between gap-2"
                    >
                      <span className="text-foreground">
                        {item.project_id ?? `action #${item.action_id}`}
                      </span>
                      <span
                        className={
                          item.status === 'carried'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {item.status} — {item.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {staleAnchor ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setRebaseOpen(true)}>Rebase…</Button>
            </>
          ) : !result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={submitting}>
                {submitting ? 'Applying…' : 'Apply to forecast'}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Stale-anchor guard — reuse the existing RebaseModal wiring. */}
      <RebaseModal
        open={rebaseOpen}
        onOpenChange={setRebaseOpen}
        scenarioName={
          (ctx.detail?.metadata as unknown as { name?: string })?.name ??
          `Scenario #${ctx.scenarioId}`
        }
        currentAnchorVersionId={ctx.anchorVersionId}
        onConfirm={handleRebaseConfirm}
      />
    </Dialog>
  );
}
