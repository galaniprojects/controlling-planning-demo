import { useState, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TreeTableColumn<T> {
  header: string;
  accessor: (node: T) => ReactNode;
  className?: string;
}

export interface HeaderGroup {
  label: string;
  colSpan: number;
  className?: string;
}

interface ExpandableTreeTableProps<T extends { id: string; children?: T[] }> {
  data: T[];
  columns: TreeTableColumn<T>[];
  onRowClick?: (node: T) => void;
  selectedId?: string;
  defaultExpanded?: Set<string>;
  headerGroups?: HeaderGroup[];
}

export function ExpandableTreeTable<T extends { id: string; children?: T[] }>({
  data,
  columns,
  onRowClick,
  selectedId,
  defaultExpanded,
  headerGroups,
}: ExpandableTreeTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded ?? new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  function renderRows(nodes: T[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];

    for (const node of nodes) {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expanded.has(node.id);
      const isSelected = node.id === selectedId;

      rows.push(
        <TableRow
          key={node.id}
          className={cn(
            'cursor-pointer transition-colors',
            isSelected ? 'bg-accent' : 'hover:bg-accent/50',
          )}
          onClick={() => onRowClick?.(node)}
        >
          {columns.map((col, i) => (
            <TableCell
              key={i}
              className={cn(
                'px-3 py-2 text-sm',
                i === 0 && 'sticky left-0 z-10',
                i === 0 && (isSelected ? 'bg-accent' : 'bg-card'),
                col.className,
              )}
            >
              {i === 0 ? (
                <div
                  className="flex items-center gap-1"
                  style={{ paddingLeft: `${depth * 24}px` }}
                >
                  {hasChildren ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(node.id);
                      }}
                      className="p-0.5 rounded hover:bg-accent shrink-0"
                    >
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-90',
                        )}
                      />
                    </button>
                  ) : (
                    <span className="w-5 shrink-0" />
                  )}
                  {col.accessor(node)}
                </div>
              ) : (
                col.accessor(node)
              )}
            </TableCell>
          ))}
        </TableRow>,
      );

      if (hasChildren && isExpanded) {
        rows.push(...renderRows(node.children!, depth + 1));
      }
    }

    return rows;
  }

  return (
    <div className="rounded-md border border-border overflow-auto">
      <Table>
        <TableHeader>
          {headerGroups && (
            <TableRow className="border-b-0">
              {headerGroups.map((group, i) => (
                <TableHead
                  key={i}
                  colSpan={group.colSpan}
                  className={cn(
                    'px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center',
                    group.className,
                  )}
                >
                  {group.label}
                </TableHead>
              ))}
            </TableRow>
          )}
          <TableRow>
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className={cn(
                  'px-3 py-2 text-xs font-medium text-muted-foreground',
                  i === 0 && 'sticky left-0 z-10 bg-muted',
                  col.className,
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            renderRows(data, 0)
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                No data available
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
