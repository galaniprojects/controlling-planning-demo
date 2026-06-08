/**
 * v5 B2 [B-PR-05] [B-OQ-02] — Apply-to-forecast confirmation modal.
 *
 * Two phases:
 *  1. confirm — user reviews scope (own-project diffs only) and clicks Apply.
 *  2. result — modal swaps to a summary of the draft Change Requests created.
 *
 * Sim E2E S2: applying no longer writes provisional Forecast cells; instead
 * it opens one DRAFT Change Request per cost centre. The result view counts
 * those CRs and deep-links each one to its project's Workbench Change History.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine,
  AlertTriangle,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/api/client';
import { navigateToWorkbenchByProject } from '@/lib/workbenchNavigation';
import { useScenarioContext } from '../useScenarioContext';
import { RebaseModal } from '../manager/RebaseModal';
import type {
  ApplyToForecastResponse,
  ApplyToForecastSummaryItem,
} from '../api/scenariosApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplyConfirmModal({ open, onOpenChange }: Props) {
  const ctx = useScenarioContext();
  const navigate = useNavigate();
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

  const handleRebaseConfirm = async (anchors: Record<string, number>) => {
    await ctx.rebase(anchors);
    // Anchors refreshed — clear the guard so the user can retry Apply.
    setStaleAnchor(false);
  };

  // Open the project's Workbench Change History so the controller can review
  // the freshly-created draft CR. We navigate by project; the Change History
  // tab surfaces the draft CR (and CRDetailModal) for that project.
  const handleOpenChangeRequest = async (item: ApplyToForecastSummaryItem) => {
    if (!item.project_id) return;
    onOpenChange(false);
    await navigateToWorkbenchByProject(item.project_id, navigate);
  };

  // Apply-confirm copy is keyed off the scenario's published state: a private
  // (unpublished) scenario shouldn't be described as "published".
  const isPublished = ctx.detail?.metadata.status === 'published';

  // Total draft CRs created: prefer the explicit top-level count, fall back to
  // summing the per-item counts so the headline stays correct if either the
  // aggregate or the per-row field is omitted by the backend.
  const draftCrCount =
    result?.draft_change_requests_created ??
    (result?.summary.reduce(
      (sum, item) => sum + (item.change_requests_created ?? 0),
      0,
    ) ??
      0);

  return (
    // While the rebase modal is open, suppress this dialog's own overlay so
    // only one dialog is visible at a time (§10). The parent `open` state is
    // preserved, so closing the rebase modal restores the stale-anchor view.
    <Dialog open={open && !rebaseOpen} onOpenChange={onOpenChange}>
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
                Carry diffs from this {isPublished ? 'published' : 'private'}{' '}
                scenario forward into your live forecast. Only diffs on projects
                you own will be carried; cross-project diffs and Stage 1 /
                Stage 2 charging changes are skipped.
              </p>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
              Applying opens a <em>draft change request</em> per cost centre in
              the Workbench. Nothing is written to the live forecast until each
              CR is reviewed and approved.
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="rounded border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-primary">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Draft change requests created
              </div>
              <p className="text-2xl font-semibold text-foreground mt-1">
                {draftCrCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                One draft CR per affected cost centre. Review and approve each
                in the Workbench to write the changes into the live forecast.
                {result.diffs_skipped > 0 && (
                  <>
                    {' '}
                    {result.diffs_skipped} diff
                    {result.diffs_skipped === 1 ? '' : 's'} skipped
                    (out-of-scope).
                  </>
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {result.provenance_note}
            </p>
            {result.summary.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-border rounded">
                <ul className="divide-y divide-border">
                  {result.summary.map((item) => {
                    const created = item.change_requests_created ?? 0;
                    const hasCr =
                      item.change_request_id != null && item.project_id != null;
                    return (
                      <li
                        key={item.action_id}
                        className="px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="text-foreground truncate">
                          {item.project_id ?? `action #${item.action_id}`}
                          {created > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              — {created} draft CR{created === 1 ? '' : 's'}
                            </span>
                          )}
                        </span>
                        {hasCr ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 shrink-0 px-2 text-xs text-primary"
                            onClick={() => handleOpenChangeRequest(item)}
                          >
                            Open CR
                            <ExternalLink
                              className="ml-1 h-3 w-3"
                              aria-hidden="true"
                            />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground shrink-0">
                            {item.message}
                          </span>
                        )}
                      </li>
                    );
                  })}
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
        scenarioId={ctx.scenarioId}
        scenarioName={
          (ctx.detail?.metadata as unknown as { name?: string })?.name ??
          `Scenario #${ctx.scenarioId}`
        }
        onConfirm={handleRebaseConfirm}
      />
    </Dialog>
  );
}
