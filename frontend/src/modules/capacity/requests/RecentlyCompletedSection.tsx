/**
 * RecentlyCompletedSection — collapsed section at the bottom of the
 * Resource Requests inbox listing the user's (or their CC's) recently
 * completed actions in the last 7 days (v5.2 W3, Track D, spec §12.8).
 *
 * Data source per §12.8 is the `CapacityActionLog` (the audit trail).
 * We consume `capacityApi.getCapacityHistory()` with a 7-day window:
 *   - CC Owner — server already scopes to their managed CC, so no
 *     additional filter is sent.
 *   - Controller — filtered to `acting_user_id = current user's
 *     person_id` so the section reflects the controller's own recent
 *     actions, per "current user's actions" in the spec.
 *
 * "Completed" excludes draft saves (`assign_draft`); confirms,
 * partials, declines, re-confirms are shown.
 *
 * Rows are non-actionable (no Review & assign button). A "View full
 * history" link at the bottom navigates to /capacity/history.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import { capacityApi } from '@/api/endpoints';
import type { CapacityHistoryEntry } from '@/types/api';

interface RecentlyCompletedSectionProps {
  /**
   * Person id of the controller currently signed in. Passing this filters
   * the section to "my actions" per spec §12.8. CC Owners should pass
   * `undefined` because the server already scopes them to their CC.
   */
  filterByPersonId?: string;
  /**
   * Refresh nonce — bump this from the parent (e.g., after a successful
   * decline) so the section re-fetches.
   */
  refreshNonce?: number;
  /** Hide the cost-center column (CC Owners). */
  hideCostCenter?: boolean;
}

const COMPLETED_ACTIONS = [
  'confirm',
  'partial_confirm',
  'decline',
  'decline_request',
  'cr_reconfirm',
];

const ACTION_LABEL: Record<string, string> = {
  confirm: 'Confirmed',
  partial_confirm: 'Partial',
  decline: 'Declined',
  decline_request: 'Declined request',
  cr_reconfirm: 'Re-confirmed',
  assign_draft: 'Draft saved',
  reassign: 'Reassigned',
};

const ACTION_BADGE: Record<string, string> = {
  confirm:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  partial_confirm:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  decline:
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  decline_request:
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cr_reconfirm:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function isoDateMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function relativeFromNow(timestamp: string): string {
  const t = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMs = now - t;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `${days} days ago`;
}

export function RecentlyCompletedSection({
  filterByPersonId,
  refreshNonce = 0,
  hideCostCenter = false,
}: RecentlyCompletedSectionProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CapacityHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    capacityApi
      .getCapacityHistory({
        from: isoDateMinusDays(7),
        action_type: COMPLETED_ACTIONS,
        acting_user_id: filterByPersonId,
        page: 1,
        page_size: 50,
        sort: 'timestamp',
        sort_dir: 'desc',
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filterByPersonId, refreshNonce]);

  const count = items.length;

  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-accent/50 transition-colors"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="text-sm font-medium text-foreground">
          Recently completed
        </span>
        <Badge variant="secondary" className="ml-1 tabular-nums">
          {loading ? '…' : count}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          Last 7 days
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : count === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No recently completed actions.
            </p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[140px]">Completed</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                  <TableHead>Project</TableHead>
                  {!hideCostCenter && (
                    <TableHead className="w-[160px]">Cost center</TableHead>
                  )}
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate(`/workbench?project=${entry.project_id}`)
                    }
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {ACTION_LABEL[entry.action_type] ?? entry.action_type}{' '}
                      {relativeFromNow(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 h-5 rounded text-[11px] font-medium',
                          ACTION_BADGE[entry.action_type] ??
                            'bg-muted text-muted-foreground',
                        )}
                      >
                        {ACTION_LABEL[entry.action_type] ?? entry.action_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {entry.project_name ?? entry.project_id}
                    </TableCell>
                    {!hideCostCenter && (
                      <TableCell className="text-sm text-foreground">
                        {entry.cost_center_name ?? entry.cost_center_id}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.summary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border-t border-border px-4 py-2 text-right">
            <button
              type="button"
              onClick={() => navigate('/capacity/history')}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View full history
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
