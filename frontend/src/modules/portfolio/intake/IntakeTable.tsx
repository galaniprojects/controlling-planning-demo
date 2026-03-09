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
      <div className="rounded-md border border-slate-200 p-8 text-center text-sm text-slate-400">
        No pending submissions
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Project Name</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Submitted By</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">LoB</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Est. Budget</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Submitted</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.project_id}
              className={cn(
                'cursor-pointer transition-colors',
                selectedId === item.project_id ? 'bg-blue-50' : 'hover:bg-slate-50',
              )}
              onClick={() => onSelect(item.project_id)}
              onDoubleClick={() => onOpenDetail?.(item.project_id)}
            >
              <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">
                {item.name}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-600">
                {item.submitted_by || '—'}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-600">
                {item.lob}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-700 text-right">
                {item.estimated_budget != null ? formatCurrency(item.estimated_budget) : '—'}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-500">
                {item.submission_date ? new Date(item.submission_date).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="px-3 py-2">
                <Badge variant="outline" className="text-xs capitalize">
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
