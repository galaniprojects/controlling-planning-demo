/**
 * RequestTable — sortable table of (project, cost-center) inbox rows
 * (v5.2 W3, Track D, spec §12.3).
 *
 * Columns:
 *   Project | PL | Cost center | Roles | Unassigned hours | Age |
 *   Priority | Status | Action
 *
 * The CC column is hidden for CC Owners (auto-scoped). The default
 * sort is `priority desc → age desc`, surfacing the oldest
 * high-priority items first. Clicking a sortable column header cycles
 * through asc/desc; clicking a different column starts at desc for
 * numeric and asc for alphabetic.
 *
 * Sort + filter happen client-side over the fully-fetched inbox
 * payload (the inbox endpoint already paginates internally — total is
 * what the parent renders for the count).
 *
 * The component is purely presentational; all data fetching, decline
 * orchestration, and navigation are owned by `RequestsInbox.tsx`.
 */
import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { CheckCircle2 } from 'lucide-react';
import type { CapacityInboxItem } from '@/types/api';
import { RequestRow } from './RequestRow';

const PRIORITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_RANK: Record<string, number> = {
  re_confirm: 3,
  in_progress: 2,
  new: 1,
};

export type SortColumn =
  | 'project_name'
  | 'pl_name'
  | 'cc_name'
  | 'unassigned_hours'
  | 'age_days'
  | 'priority'
  | 'status';

export type SortDir = 'asc' | 'desc';

interface RequestTableProps {
  items: CapacityInboxItem[];
  showCostCenter: boolean;
  /** Set of "{projectId}::{ccId}::{cr}" keys currently in the declined animation. */
  decliningKeys: Set<string>;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSortChange: (col: SortColumn) => void;
  onDecline: (
    projectId: string,
    ccId: string,
    reason: string,
  ) => Promise<void>;
  onReviewAssign: (projectId: string, ccId: string) => void;
}

function rowKey(item: CapacityInboxItem): string {
  return `${item.project_id}::${item.cc_id}::${item.cr_id ?? 'new'}`;
}

function compareItems(
  a: CapacityInboxItem,
  b: CapacityInboxItem,
  col: SortColumn,
  dir: SortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (col) {
    case 'project_name':
      return a.project_name.localeCompare(b.project_name) * sign;
    case 'pl_name':
      return (a.pl_name ?? '').localeCompare(b.pl_name ?? '') * sign;
    case 'cc_name':
      return a.cc_name.localeCompare(b.cc_name) * sign;
    case 'unassigned_hours':
      return (a.unassigned_hours - b.unassigned_hours) * sign;
    case 'age_days':
      return (a.age_days - b.age_days) * sign;
    case 'priority':
      return (
        ((PRIORITY_RANK[a.project_priority] ?? 0) -
          (PRIORITY_RANK[b.project_priority] ?? 0)) *
        sign
      );
    case 'status':
      return (
        ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)) * sign
      );
    default:
      return 0;
  }
}

export function RequestTable({
  items,
  showCostCenter,
  decliningKeys,
  sortColumn,
  sortDir,
  onSortChange,
  onDecline,
  onReviewAssign,
}: RequestTableProps) {
  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const primary = compareItems(a, b, sortColumn, sortDir);
      if (primary !== 0) return primary;
      // Tiebreaker: priority desc → age desc, mirroring the server's
      // default ordering so identical rows feel stable to the user.
      const priDelta =
        (PRIORITY_RANK[b.project_priority] ?? 0) -
        (PRIORITY_RANK[a.project_priority] ?? 0);
      if (priDelta !== 0) return priDelta;
      return b.age_days - a.age_days;
    });
    return copy;
  }, [items, sortColumn, sortDir]);

  if (sorted.length === 0) {
    // v5.2 W6 Track C — spec §12.7 prescribes the celebratory empty state
    // for the inbox: green check + "all caught up" tone. CheckCircle2
    // (Lucide) is rendered via EmptyState so the colour stays muted on
    // the icon container; the title carries the affirmative copy.
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          description="No pending resource requests match the current filters."
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-muted/40">
            <SortableHeader
              column="project_name"
              label="Project"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
            />
            <SortableHeader
              column="pl_name"
              label="PL"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
              className="w-[140px]"
            />
            {showCostCenter && (
              <SortableHeader
                column="cc_name"
                label="Cost center"
                sortColumn={sortColumn}
                sortDirection={sortDir}
                onSort={(c) => onSortChange(c as SortColumn)}
                className="w-[180px]"
              />
            )}
            <TableHead className="w-[200px] text-muted-foreground font-medium">
              Roles requested
            </TableHead>
            <SortableHeader
              column="unassigned_hours"
              label="Unassigned"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
              align="right"
              className="w-[110px]"
            />
            <SortableHeader
              column="age_days"
              label="Age"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
              align="right"
              className="w-[70px]"
            />
            <SortableHeader
              column="priority"
              label="Priority"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
              className="w-[90px]"
            />
            <SortableHeader
              column="status"
              label="Status"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as SortColumn)}
              className="w-[110px]"
            />
            <TableHead className="w-[160px] text-right text-muted-foreground font-medium">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => (
            <RequestRow
              key={rowKey(item)}
              item={item}
              showCostCenter={showCostCenter}
              declined={decliningKeys.has(rowKey(item))}
              onDecline={onDecline}
              onReviewAssign={onReviewAssign}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { rowKey as inboxRowKey };
