/**
 * HistoryTable — chronological audit-log table (v5.2 W3, Track D,
 * spec §12.13).
 *
 * Sorting is server-side (the parent passes `sort` + `sort_dir` to
 * `getCapacityHistory`). The component is purely presentational.
 *
 * Columns: Date | User | Action | Project | Cost center | Summary | ▶
 * Cost-center column is hidden for CC Owners (they're auto-scoped).
 */
import { useState } from 'react';
import { History } from 'lucide-react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import type { CapacityHistoryEntry } from '@/types/api';
import { HistoryRow } from './HistoryRow';

export type HistorySortColumn =
  | 'timestamp'
  | 'acting_user_id'
  | 'action_type'
  | 'project_id'
  | 'cost_center_id';

export type HistorySortDir = 'asc' | 'desc';

interface HistoryTableProps {
  items: CapacityHistoryEntry[];
  showCostCenter: boolean;
  sortColumn: HistorySortColumn;
  sortDir: HistorySortDir;
  onSortChange: (col: HistorySortColumn) => void;
}

export function HistoryTable({
  items,
  showCostCenter,
  sortColumn,
  sortDir,
  onSortChange,
}: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          icon={History}
          title="No history entries"
          description="No capacity actions match the current filters and date range."
          size="sm"
        />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-muted/40">
            <SortableHeader
              column="timestamp"
              label="Date"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as HistorySortColumn)}
              className="w-[160px]"
            />
            <SortableHeader
              column="acting_user_id"
              label="User"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as HistorySortColumn)}
              className="w-[160px]"
            />
            <SortableHeader
              column="action_type"
              label="Action"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as HistorySortColumn)}
              className="w-[120px]"
            />
            <SortableHeader
              column="project_id"
              label="Project"
              sortColumn={sortColumn}
              sortDirection={sortDir}
              onSort={(c) => onSortChange(c as HistorySortColumn)}
            />
            {showCostCenter && (
              <SortableHeader
                column="cost_center_id"
                label="Cost center"
                sortColumn={sortColumn}
                sortDirection={sortDir}
                onSort={(c) => onSortChange(c as HistorySortColumn)}
                className="w-[160px]"
              />
            )}
            <TableHead className="text-muted-foreground font-medium">
              Summary
            </TableHead>
            <TableHead className="w-[40px]" aria-label="Expand"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === entry.id ? null : entry.id))
              }
              showCostCenter={showCostCenter}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
