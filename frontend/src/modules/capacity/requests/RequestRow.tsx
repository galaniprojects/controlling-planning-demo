/**
 * RequestRow — single row in the Resource Requests inbox table
 * (v5.2 W3, Track D, spec §12.3 / §12.5 / §12.6 / §12.7).
 *
 * One row represents one (project, cost-center) tuple from the inbox
 * payload. Renders:
 *
 *   - Project cell: name + hierarchy node badge + (if CR) blue "CR"
 *     pill with a one-line CR summary on the line below.
 *   - PL name.
 *   - Cost center (hidden for CC Owners — see parent table).
 *   - Roles requested (compact badge set, e.g. "Sr Dev × 1", "QA × 2").
 *   - Unassigned hours (amber > 0, green if 0).
 *   - Age in days (red >14d, amber >7d, default else).
 *   - Priority (High/Medium/Low colour pill).
 *   - Status (New / In progress / Re-confirm).
 *   - Action: Primary "Review & assign" → /capacity?assignment_project=
 *     {pid}&cc={ccid} (W4 S6a wires it). Secondary dropdown
 *     "Decline all" → expands an inline `DeclineInlineForm`.
 *
 * Decline UX (§12.7): on confirm, the parent flips this row's
 * `declined` flag → row gets a strikethrough + fade-out (~3s) before
 * the parent removes it from state. The rendering of the strikethrough
 * is handled here (visual side); the parent owns the timer.
 */
import { useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import type { CapacityInboxItem, CapacityInboxStatus } from '@/types/api';
import { DeclineInlineForm } from './DeclineInlineForm';

interface RequestRowProps {
  item: CapacityInboxItem;
  /** Hides the cost-center column for CC Owners. */
  showCostCenter: boolean;
  /** When true, this row is animating out post-decline (strikethrough + fade). */
  declined?: boolean;
  /** Async submit handler — parent calls capacityApi.declineProject. */
  onDecline: (
    projectId: string,
    ccId: string,
    reason: string,
  ) => Promise<void>;
  /** Navigate to the workspace with assignment mode for this project. */
  onReviewAssign: (projectId: string, ccId: string) => void;
}

const PRIORITY_BADGE: Record<
  string,
  { label: string; classes: string }
> = {
  high: {
    label: 'High',
    classes:
      'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/40',
  },
  medium: {
    label: 'Medium',
    classes:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/40',
  },
  low: {
    label: 'Low',
    classes:
      'bg-muted text-muted-foreground border-border',
  },
};

const STATUS_BADGE: Record<
  CapacityInboxStatus,
  { label: string; classes: string }
> = {
  new: {
    label: 'New',
    classes:
      'bg-muted text-foreground border-border',
  },
  in_progress: {
    label: 'In progress',
    classes:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/40',
  },
  re_confirm: {
    label: 'Re-confirm',
    classes:
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/40',
  },
};

function ageColorClass(age: number): string {
  if (age > 14) return 'text-red-600 dark:text-red-400 font-medium';
  if (age > 7) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-muted-foreground';
}

export function RequestRow({
  item,
  showCostCenter,
  declined = false,
  onDecline,
  onReviewAssign,
}: RequestRowProps) {
  const [showDecline, setShowDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const colSpan = 9 - (showCostCenter ? 0 : 1);

  const submitDecline = async (reason: string) => {
    setSubmitting(true);
    try {
      await onDecline(item.project_id, item.cc_id, reason);
      setShowDecline(false);
    } catch {
      // Parent surfaces toasts/errors; keep the form open so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  const priority = PRIORITY_BADGE[item.project_priority] ?? PRIORITY_BADGE.medium;
  const statusBadge = STATUS_BADGE[item.status];
  const unassignedColor = item.unassigned_hours > 0
    ? 'text-amber-700 dark:text-amber-400 font-medium'
    : 'text-emerald-700 dark:text-emerald-400 font-medium';
  const isCR = item.type === 'change_request';

  return (
    <>
      <TableRow
        data-row-key={`${item.project_id}::${item.cc_id}::${item.cr_id ?? 'new'}`}
        className={cn(
          'transition-all duration-700',
          declined && 'opacity-40 [&>td]:line-through',
        )}
      >
        {/* Project + CR + hierarchy */}
        <TableCell className="py-3 align-top">
          <div className="flex items-start gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">
                  {item.project_name}
                </span>
                {isCR && (
                  <span
                    className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-blue-600 text-white"
                    aria-label="Change request"
                  >
                    CR
                  </span>
                )}
                {item.hierarchy_node_name && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 font-normal"
                  >
                    {item.hierarchy_node_name}
                  </Badge>
                )}
              </div>
              {isCR && item.cr_summary && (
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {item.cr_summary}
                </p>
              )}
            </div>
          </div>
        </TableCell>

        {/* PL */}
        <TableCell className="py-3 text-sm text-foreground align-top">
          {item.pl_name ?? <span className="text-muted-foreground">—</span>}
        </TableCell>

        {/* Cost center (hidden for CC Owners) */}
        {showCostCenter && (
          <TableCell className="py-3 text-sm text-foreground align-top">
            {item.cc_name}
          </TableCell>
        )}

        {/* Roles requested */}
        <TableCell className="py-3 align-top">
          <div className="flex flex-wrap gap-1">
            {item.role_badges.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              item.role_badges.map((b) => (
                <Badge
                  key={b.role_type_id}
                  variant="secondary"
                  className="text-[11px] px-1.5 py-0 h-5 font-normal"
                >
                  {b.role_name}
                  <span className="text-muted-foreground ml-1">×{b.count}</span>
                </Badge>
              ))
            )}
          </div>
        </TableCell>

        {/* Unassigned hours */}
        <TableCell
          className={cn('py-3 text-sm tabular-nums text-right', unassignedColor)}
        >
          {formatNumber(item.unassigned_hours)}h
        </TableCell>

        {/* Age */}
        <TableCell
          className={cn(
            'py-3 text-sm tabular-nums text-right',
            ageColorClass(item.age_days),
          )}
        >
          {item.age_days}d
        </TableCell>

        {/* Priority */}
        <TableCell className="py-3 align-top">
          <span
            className={cn(
              'inline-flex items-center px-2 h-5 rounded text-[11px] font-medium border',
              priority.classes,
            )}
          >
            {priority.label}
          </span>
        </TableCell>

        {/* Status */}
        <TableCell className="py-3 align-top">
          <span
            className={cn(
              'inline-flex items-center px-2 h-5 rounded text-[11px] font-medium border',
              statusBadge.classes,
            )}
          >
            {statusBadge.label}
          </span>
        </TableCell>

        {/* Action */}
        <TableCell className="py-3 align-top">
          <div className="flex items-center gap-1 justify-end">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-8 text-xs"
              onClick={() => onReviewAssign(item.project_id, item.cc_id)}
              disabled={declined}
            >
              Review &amp; assign
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-0 pointer-events-none" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  aria-label="More actions"
                  disabled={declined}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowDecline((prev) => !prev);
                  }}
                >
                  Decline all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>

      {/* Inline decline form expansion */}
      {showDecline && !declined && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={colSpan} className="py-3">
            <DeclineInlineForm
              isSubmitting={submitting}
              onConfirm={submitDecline}
              onCancel={() => setShowDecline(false)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
