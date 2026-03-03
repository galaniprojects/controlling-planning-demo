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
import type { ApprovalItem } from '@/types/api';
import { Sparkles } from 'lucide-react';

interface Props {
  items: ApprovalItem[];
  loading: boolean;
  selectedId?: number;
  onSelect: (crId: number) => void;
}

export function ApprovalsTable({ items, loading, selectedId, onSelect }: Props) {
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
        No pending approvals
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Project</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">CR Summary</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Submitted By</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Confirmed By</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Impact</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500">Date</TableHead>
            <TableHead className="px-3 py-2 text-xs font-medium text-slate-500 w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.cr_id}
              className={cn(
                'cursor-pointer transition-colors',
                selectedId === item.cr_id ? 'bg-blue-50' : 'hover:bg-slate-50',
              )}
              onClick={() => onSelect(item.cr_id)}
            >
              <TableCell className="px-3 py-2 text-sm font-medium text-slate-800">
                {item.project_name}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-600 max-w-[200px] truncate">
                {item.summary}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-600">
                {item.submitted_by}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-600">
                {item.confirmed_by_cc_owner || '—'}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-right">
                {item.impact_eur_delta != null ? (
                  <span className={item.impact_eur_delta > 0 ? 'text-red-600' : 'text-green-600'}>
                    {item.impact_eur_delta > 0 ? '+' : ''}
                    {formatCurrency(item.impact_eur_delta)}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-500">
                {new Date(item.submission_date).toLocaleDateString()}
              </TableCell>
              <TableCell className="px-3 py-2">
                {item.system_suggested && (
                  <Badge className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5">
                    <Sparkles className="h-3 w-3 mr-0.5" />
                    AI
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
