import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { useActiveHierarchy } from '@/hooks/useActiveHierarchy';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { IntakeItem } from '@/types/api';

interface Props {
  items: IntakeItem[];
  loading: boolean;
  selectedId?: string;
  onSelect: (projectId: string) => void;
  onOpenDetail?: (projectId: string) => void;
}

export function IntakeTable({ items, loading, selectedId, onSelect, onOpenDetail }: Props) {
  const { topLevelLabel } = useActiveHierarchy();
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No pending submissions
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Project Name</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Submitted By</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">{topLevelLabel}</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Est. Budget</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Submitted</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.project_id}
              className={cn(
                'cursor-pointer transition-colors',
                selectedId === item.project_id ? 'bg-primary/5' : 'hover:bg-accent',
              )}
              onClick={() => onSelect(item.project_id)}
              onDoubleClick={() => onOpenDetail?.(item.project_id)}
            >
              <TableCell className="px-3 py-2 text-sm font-medium text-foreground">
                {item.name}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                {item.submitted_by || '—'}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                {item.lob}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-foreground text-right">
                {item.estimated_budget != null ? formatCurrency(item.estimated_budget) : '—'}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-muted-foreground">
                {item.submission_date ? new Date(item.submission_date).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="px-3 py-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs capitalize',
                    item.status === 'changes_requested' && 'border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:bg-amber-900/30',
                  )}
                >
                  {item.status.replace(/_/g, ' ')}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
