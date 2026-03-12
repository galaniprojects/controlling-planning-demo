import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planned: {
    label: 'Planned',
    className: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  },
  in_basket: {
    label: 'In Basket',
    className: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  },
  ordered: {
    label: 'Ordered',
    className: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  },
  goods_received: {
    label: 'GR',
    className: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100',
  },
  invoiced: {
    label: 'Invoiced',
    className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  },
  accrual: {
    label: 'Accrual',
    className: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  },
  open: {
    label: 'Open',
    className: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  },
};

interface Props {
  status: string | null | undefined;
  size?: 'sm' | 'default';
}

export function ExternalCostStatusBadge({ status, size = 'sm' }: Props) {
  if (!status) return null;
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  };
  return (
    <Badge
      variant="secondary"
      className={`${config.className} ${size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-xs px-2 py-0.5'} font-medium`}
    >
      {config.label}
    </Badge>
  );
}

/** Summary grouping labels for the status summary bar */
export const STATUS_SUMMARY_ORDER = [
  'planned',
  'in_basket',
  'ordered',
  'goods_received',
  'invoiced',
  'accrual',
  'open',
] as const;

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status;
}
