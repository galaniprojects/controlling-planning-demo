import { Badge } from '@/components/ui/badge';
import {
  ExpandableTreeTable,
  type TreeTableColumn,
} from '@/components/shared/ExpandableTreeTable';
import { Skeleton } from '@/components/shared/Skeleton';
import { ragBgColor } from '@/lib/rag';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ProjectTreeNode } from '@/types/api';

interface Props {
  data: ProjectTreeNode[];
  loading: boolean;
  selectedId?: string;
  onProjectSelect: (node: ProjectTreeNode) => void;
}

const TYPE_LABELS: Record<string, string> = {
  lob: 'LoB',
  program: 'Program',
  project: 'Project',
  service: 'Service',
};

const columns: TreeTableColumn<ProjectTreeNode>[] = [
  {
    header: 'Name',
    className: 'min-w-[240px]',
    accessor: (node) => (
      <div className="flex items-center gap-2">
        {node.rag && (
          <span
            className={cn(
              'h-2 w-2 rounded-full shrink-0',
              node.rag === 'green' && 'bg-green-500',
              node.rag === 'amber' && 'bg-amber-500',
              node.rag === 'red' && 'bg-red-500',
            )}
          />
        )}
        <span className="font-medium text-slate-800 truncate">{node.name}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {TYPE_LABELS[node.type] || node.type}
        </Badge>
      </div>
    ),
  },
  {
    header: 'Status',
    className: 'w-[100px]',
    accessor: (node) =>
      node.status ? (
        <span className="capitalize text-slate-600">{node.status.replace(/_/g, ' ')}</span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    header: 'RAG',
    className: 'w-[80px]',
    accessor: (node) =>
      node.rag ? (
        <Badge className={cn('text-xs capitalize', ragBgColor(node.rag))}>
          {node.rag}
        </Badge>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  {
    header: 'Baseline',
    className: 'w-[100px] text-right',
    accessor: (node) => (
      <span className="text-slate-700">{formatCurrency(node.baseline_budget)}</span>
    ),
  },
  {
    header: 'Forecast',
    className: 'w-[100px] text-right',
    accessor: (node) => (
      <span className="text-slate-700">{formatCurrency(node.current_forecast)}</span>
    ),
  },
  {
    header: 'Actuals YTD',
    className: 'w-[100px] text-right',
    accessor: (node) => (
      <span className="text-slate-700">{formatCurrency(node.actuals_ytd)}</span>
    ),
  },
  {
    header: 'Variance',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span
        className={cn(
          'font-medium',
          node.variance_pct > 10 && 'text-red-600',
          node.variance_pct > 5 && node.variance_pct <= 10 && 'text-amber-600',
          node.variance_pct <= 5 && 'text-green-600',
        )}
      >
        {formatPercent(node.variance_pct)}
      </span>
    ),
  },
  {
    header: 'Timeline',
    className: 'w-[140px]',
    accessor: (node) =>
      node.timeline?.start ? (
        <span className="text-slate-500 text-xs">
          {node.timeline.start} — {node.timeline.end || '?'}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
];

export function PortfolioTree({ data, loading, selectedId, onProjectSelect }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ExpandableTreeTable
      data={data}
      columns={columns}
      onRowClick={(node) => {
        if (node.type === 'project' || node.type === 'service') {
          onProjectSelect(node);
        }
      }}
      selectedId={selectedId}
    />
  );
}
