/**
 * v5 B2 [B-PR-01..06] — PromoteReviewPage.
 *
 * The Promote workflow orchestrator. Steps:
 *  Step 1 (entry): controller arrives via PromoteEnter. Component
 *    calls `promotePreview(undefined)` → all un-promoted action diffs.
 *    If preview returns 409 stale-anchor (mapped on the API client),
 *    the page shows the rebase prompt instead of the diff list.
 *  Step 2: DiffSelector with category-grouped checkboxes. No global
 *    select-all per `[B-PR-03]`.
 *  Step 3: RoutingPreview shows the chosen subset; user can refine.
 *  Step 4: Confirm via PromoteConfirmModal → calls
 *    `promoteExecute(selectedIds, notes)`.
 *  Step 5: Post-execute summary inline, with a "View history" button
 *    that opens PromoteAuditDrawer.
 *
 * Permission gate: redirects to scenario workspace if the user is not
 * a controller. Backend rejects independently as defense-in-depth.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { parseServerTimestamp } from '@/lib/formatters';
import { navigateToWorkbenchByProject } from '@/lib/workbenchNavigation';
import { useCanPromote } from '../permissions';
import { useScenarioContext } from '../useScenarioContext';
import type {
  PromoteExecuteResponse,
  PromotePreviewResponse,
  RoutingDecisionItem,
} from '../api/scenariosApi';
import { ROUTING_LABELS, type RoutingType } from './routingLabels';
import { DiffSelector } from './DiffSelector';
import { RoutingPreview } from './RoutingPreview';
import { PromoteConfirmModal } from './PromoteConfirmModal';
import { PromoteAuditDrawer } from './PromoteAuditDrawer';

export function PromoteReviewPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const canPromote = useCanPromote();
  const { scenarioId, detail, archived, promotePreview } = useScenarioContext();

  const [preview, setPreview] = useState<PromotePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<{
    detail: string;
    hint?: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executeResult, setExecuteResult] =
    useState<PromoteExecuteResponse | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  // Redirect non-controllers / archived scenarios.
  useEffect(() => {
    if (!canPromote) {
      navigate(`/simulator/scenarios/${params.id ?? scenarioId}`, {
        replace: true,
      });
    }
  }, [canPromote, navigate, params.id, scenarioId]);

  // Fetch preview on mount.
  useEffect(() => {
    if (!canPromote || archived) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    promotePreview()
      .then((res) => {
        if (!cancelled) {
          setPreview(res);
          // Pre-select every "OK" decision for convenience; user can deselect.
          const initiallyOk = new Set<number>();
          for (const d of res.decisions) {
            if (d.permission_ok === false) continue;
            if (d.routing_type === 'no_route') continue;
            initiallyOk.add(d.action_id);
          }
          setSelected(initiallyOk);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // The api client surfaces the body's detail field when present;
        // try to detect stale-anchor messages.
        const isRebase = /rebase|anchor/i.test(msg);
        setPreviewError({
          detail: msg,
          hint: isRebase ? 'rebase' : undefined,
        });
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canPromote, archived, promotePreview]);

  const decisions: RoutingDecisionItem[] = preview?.decisions ?? [];

  const actionLookup = useMemo(() => {
    const out = new Map<
      number,
      {
        id: number;
        action_type: string;
        scope: string;
        project_id: string | null;
        promoted_at?: string | null;
      }
    >();
    if (!detail) return out;
    for (const a of detail.actions) {
      // ScenarioAction shipped to FE doesn't include promoted_at yet; this
      // map is forward-compatible for when the backend serialiser exposes
      // it. For now, post-promote refresh re-fetches detail and any
      // `promoted_at` field added in future will populate this.
      const p = a as typeof a & { promoted_at?: string | null };
      out.set(a.id, {
        id: a.id,
        action_type: a.action_type,
        scope: a.scope,
        project_id: a.project_id,
        promoted_at: p.promoted_at ?? null,
      });
    }
    return out;
  }, [detail]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of selected) {
      const d = decisions.find((x) => x.action_id === id);
      if (!d) continue;
      counts[d.routing_type] = (counts[d.routing_type] ?? 0) + 1;
    }
    return counts;
  }, [selected, decisions]);

  if (!canPromote) {
    return null;
  }

  const headerSubtitle = detail
    ? `${detail.metadata.name} — ${decisions.length} diff${decisions.length === 1 ? '' : 's'} eligible`
    : '';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/simulator/scenarios/${params.id ?? scenarioId}`)
            }
            className="-ml-2 h-7 text-muted-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to scenario
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Promote scenario
          </h1>
          {headerSubtitle && (
            <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAuditOpen(true)}
          >
            <History className="mr-2 h-4 w-4" />
            Promotion history
          </Button>
        </div>
      </header>

      {archived && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            This scenario is archived and cannot be promoted. Restore it from the
            scenario manager first.
          </CardContent>
        </Card>
      )}

      {previewLoading && !archived && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building routing preview…
        </div>
      )}

      {previewError && !archived && (
        <Card>
          <CardHeader>
            <CardTitle>Cannot promote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">{previewError.detail}</p>
            {previewError.hint === 'rebase' && (
              <Button
                type="button"
                onClick={() =>
                  navigate(`/simulator/scenarios/${params.id ?? scenarioId}`)
                }
              >
                Go to scenario to rebase
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!archived && preview && !previewError && (
        <>
          {/* Step 2 — DiffSelector */}
          <Card>
            <CardHeader>
              <CardTitle>Step 1 — Select diffs to promote</CardTitle>
            </CardHeader>
            <CardContent>
              <DiffSelector
                decisions={decisions}
                actionLookup={actionLookup}
                selected={selected}
                onChange={setSelected}
              />
            </CardContent>
          </Card>

          {/* Step 3 — Routing preview of the chosen subset */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2 — Routing preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary).map(([rt, n]) => {
                  const lbl =
                    ROUTING_LABELS[rt as RoutingType] ?? ROUTING_LABELS.no_route;
                  return (
                    <Badge
                      key={rt}
                      variant="outline"
                      className={`text-[10px] ${lbl.badgeClass}`}
                    >
                      {lbl.title}: {n}
                    </Badge>
                  );
                })}
                {Object.keys(summary).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Nothing selected.
                  </span>
                )}
              </div>
              <RoutingPreview decisions={decisions} selectedIds={selected} />
            </CardContent>
          </Card>

          {/* Step 4 — Confirm */}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                navigate(`/simulator/scenarios/${params.id ?? scenarioId}`)
              }
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={selected.size === 0}
            >
              Confirm and execute
            </Button>
          </div>
        </>
      )}

      {/* Step 5 — Post-execute summary */}
      {executeResult && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Applied {executeResult.promoted_count} diff
              {executeResult.promoted_count === 1 ? '' : 's'} at{' '}
              <span className="font-mono">
                {new Date(parseServerTimestamp(executeResult.promoted_at)).toLocaleString()}
              </span>
              .
              {executeResult.skipped_count > 0 && (
                <>
                  {' '}
                  Skipped {executeResult.skipped_count} (see history for
                  details).
                </>
              )}
            </p>
            {(() => {
              // Sim E2E S2: promote now routes cross-project diffs into draft
              // Change Requests (one per other-PL project). Surface the count
              // and a deep-link to each project's Workbench Change History.
              const crRows = executeResult.summary.filter(
                (row) =>
                  row.status === 'promoted' &&
                  (row.routing_type === 'change_request' ||
                    row.change_request_id != null),
              );
              if (crRows.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    Created {crRows.length} draft change request
                    {crRows.length === 1 ? '' : 's'} for routed diffs.
                  </p>
                  <ul className="divide-y divide-border rounded border border-border">
                    {crRows.map((row) => (
                      <li
                        key={row.action_id}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"
                      >
                        <span className="truncate text-foreground">
                          {row.project_id ?? row.message}
                        </span>
                        {row.project_id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 shrink-0 px-2 text-xs text-primary"
                            onClick={() =>
                              navigateToWorkbenchByProject(
                                row.project_id as string,
                                navigate,
                              )
                            }
                          >
                            Open CR
                            <ExternalLink
                              className="ml-1 h-3 w-3"
                              aria-hidden="true"
                            />
                          </Button>
                        ) : (
                          <span className="shrink-0 text-muted-foreground">
                            {row.target_id
                              ? `CR ${row.target_id}`
                              : 'created'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAuditOpen(true)}
              >
                View promotion history
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  navigate(`/simulator/scenarios/${params.id ?? scenarioId}`)
                }
              >
                Back to scenario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <PromoteConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        selectedIds={Array.from(selected)}
        totalDecisions={decisions.length}
        onComplete={(result) => {
          setExecuteResult(result);
          setConfirmOpen(false);
          // Persisted action ids that were promoted are flagged on the
          // refetched detail (via context.reload inside promoteExecute).
          // Remove successful ids from the eligible-to-promote set so the
          // selector reflects the new state if the user stays on the page.
          setSelected((prev) => {
            const next = new Set(prev);
            for (const row of result.summary) {
              if (row.status === 'promoted') next.delete(row.action_id);
            }
            return next;
          });
        }}
      />

      <PromoteAuditDrawer
        scenarioId={scenarioId}
        open={auditOpen}
        onOpenChange={setAuditOpen}
      />
    </div>
  );
}
