import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  status: string;
}

function statusColor(status: string): string {
  if (status.startsWith('pending')) return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
  if (status === 'approved') return 'bg-green-100 text-green-700 hover:bg-green-100';
  if (status === 'rejected') return 'bg-red-100 text-red-700 hover:bg-red-100';
  if (status.startsWith('sent_back')) return 'bg-slate-100 text-slate-600 hover:bg-slate-100';
  return 'bg-slate-100 text-slate-500 hover:bg-slate-100';
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Cc', 'CC');
}

export function StatusBadge({ status }: Props) {
  return (
    <Badge className={cn('text-[10px]', statusColor(status))}>
      {formatStatus(status)}
    </Badge>
  );
}
