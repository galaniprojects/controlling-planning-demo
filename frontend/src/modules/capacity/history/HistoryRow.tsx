/**
 * HistoryRow — single row in the audit-history table (v5.2 W3,
 * Track D, spec §12.13).
 *
 * Columns: Date | User | Action | Project | Cost center | Summary | ▶
 *
 * Clicking the chevron toggles the inline `HistoryDetailExpand`
 * which renders the structured `detail_payload` breakdown beneath
 * the row.
 */
import { ChevronRight } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CapacityHistoryEntry } from '@/types/api';
import { HistoryDetailExpand } from './HistoryDetailExpand';

interface HistoryRowProps {
  entry: CapacityHistoryEntry;
  expanded: boolean;
  onToggle: () => void;
  showCostCenter: boolean;
}

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
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/40',
  partial_confirm:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/40',
  decline:
    'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/40',
  decline_request:
    'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/40',
  cr_reconfirm:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/40',
  assign_draft:
    'bg-muted text-muted-foreground border-border',
  reassign:
    'bg-muted text-muted-foreground border-border',
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} ${hh}:${mm}`;
}

export function HistoryRow({
  entry,
  expanded,
  onToggle,
  showCostCenter,
}: HistoryRowProps) {
  const colSpan = 7 - (showCostCenter ? 0 : 1);

  return (
    <>
      <TableRow
        onClick={onToggle}
        className="cursor-pointer"
        aria-expanded={expanded}
      >
        <TableCell className="text-xs text-foreground tabular-nums">
          {formatTimestamp(entry.timestamp)}
        </TableCell>
        <TableCell className="text-sm text-foreground">
          {entry.acting_user_name}
        </TableCell>
        <TableCell>
          <span
            className={cn(
              'inline-flex items-center px-2 h-5 rounded text-[11px] font-medium border',
              ACTION_BADGE[entry.action_type] ??
                'bg-muted text-muted-foreground border-border',
            )}
          >
            {ACTION_LABEL[entry.action_type] ?? entry.action_type}
          </span>
        </TableCell>
        <TableCell className="text-sm text-foreground">
          {entry.project_name ?? entry.project_id}
        </TableCell>
        {showCostCenter && (
          <TableCell className="text-sm text-foreground">
            {entry.cost_center_name ?? entry.cost_center_id}
          </TableCell>
        )}
        <TableCell className="text-xs text-muted-foreground max-w-[40ch] truncate">
          {entry.summary}
        </TableCell>
        <TableCell className="w-[40px]">
          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="p-0">
            <HistoryDetailExpand entry={entry} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
