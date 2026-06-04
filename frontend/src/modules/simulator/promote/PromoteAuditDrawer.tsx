/**
 * v5 B2 [B-PR-04] — PromoteAuditDrawer.
 *
 * Right-side sheet that lists past promotion events for the current
 * scenario, fetched lazily from `GET /api/scenarios/:id/promotions`.
 * Each event shows: timestamp, promoter, count promoted vs skipped,
 * notes, and the routing summary array. Used from the Promote review
 * page header ("View past promotions") and from the workspace header.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ExternalLink, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { scenariosApi, type PromotionAuditItem } from '../api/scenariosApi';
import { parseServerTimestamp } from '@/lib/formatters';
import { navigateToWorkbenchByProject } from '@/lib/workbenchNavigation';
import {
  ROUTING_LABELS,
  type RoutingType,
} from './routingLabels';

interface Props {
  scenarioId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoteAuditDrawer({ scenarioId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PromotionAuditItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    scenariosApi
      .promotionsList(scenarioId)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col overflow-hidden sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Promotion history
          </SheetTitle>
          <SheetDescription>
            Audit trail of past promotions for this scenario. Each row captures
            who promoted, when, and the routing outcome of each diff.
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {!loading && !error && items && items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No promotions yet. Use Promote on the scenario header to start.
            </p>
          )}

          {!loading && !error && items && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((item) => {
                // Sim E2E S2: count routed change_request rows so the event
                // header can flag how many draft CRs the promotion opened.
                const crCount = item.summary.filter(
                  (row) =>
                    row.status === 'promoted' &&
                    (row.routing_type === 'change_request' ||
                      row.change_request_id != null),
                ).length;
                return (
                <li
                  key={item.id}
                  className="space-y-2 rounded-md border border-border bg-card p-3"
                >
                  <header className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-foreground">
                        {new Date(parseServerTimestamp(item.promoted_at)).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Promoted by{' '}
                        <span className="font-mono">{item.promoted_by_id}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className="border-emerald-300 text-[10px] text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                      >
                        {item.promoted_count} applied
                      </Badge>
                      {crCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-primary/40 text-[10px] text-primary"
                        >
                          {crCount} draft CR{crCount === 1 ? '' : 's'}
                        </Badge>
                      )}
                      {item.skipped_count > 0 && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-700 dark:text-amber-400"
                        >
                          {item.skipped_count} skipped
                        </Badge>
                      )}
                    </div>
                  </header>

                  {item.notes && (
                    <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      {item.notes}
                    </p>
                  )}

                  <ul className="divide-y divide-border text-xs">
                    {item.summary.map((row, idx) => {
                      const lbl =
                        ROUTING_LABELS[row.routing_type as RoutingType] ??
                        ROUTING_LABELS.no_route;
                      return (
                        <li
                          key={`${item.id}-${row.action_id}-${idx}`}
                          className="flex items-start gap-2 py-1.5"
                        >
                          <span className="font-mono text-muted-foreground">
                            #{row.action_id}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${lbl.badgeClass}`}
                          >
                            {lbl.title}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              row.status === 'promoted'
                                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                                : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {row.status}
                          </Badge>
                          <span className="flex-1 text-muted-foreground">
                            {row.message}
                          </span>
                          {(row.routing_type === 'change_request' ||
                            row.change_request_id != null) &&
                            row.project_id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-5 shrink-0 px-1.5 text-[10px] text-primary"
                                onClick={() =>
                                  navigateToWorkbenchByProject(
                                    row.project_id as string,
                                    navigate,
                                  )
                                }
                              >
                                Open CR
                                <ExternalLink
                                  className="ml-1 h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                              </Button>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
