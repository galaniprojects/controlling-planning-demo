import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  planned: {
    label: 'Planned',
    className: 'bg-muted text-muted-foreground hover:bg-muted',
  },
  in_basket: {
    label: 'In Basket',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  },
  ordered: {
    label: 'Ordered',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40',
  },
  goods_received: {
    label: 'GR',
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40',
  },
  invoiced: {
    label: 'Invoiced',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
  },
  accrual: {
    label: 'Accrual',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40',
  },
  open: {
    label: 'Open',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40',
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
    className: 'bg-muted text-muted-foreground hover:bg-muted',
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
