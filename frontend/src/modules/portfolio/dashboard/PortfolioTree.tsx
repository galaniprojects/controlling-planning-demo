import { Badge } from '@/components/ui/badge';
import {
  ExpandableTreeTable,
  type TreeTableColumn,
  type HeaderGroup,
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
  project: 'Project',
  service: 'Service',
};

/** Format entity type name for display as a badge.
 *  Known types get short labels; dynamic types get title-cased. */
function getTypeLabel(type: string): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  // Convert snake_case to Title Case (e.g., "line_of_business" → "Line of Business")
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const columns: TreeTableColumn<ProjectTreeNode>[] = [
  {
    header: 'Name',
    className: 'min-w-[220px]',
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
        <span className="font-medium text-foreground truncate">{node.name}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {getTypeLabel(node.type)}
        </Badge>
      </div>
    ),
  },
  {
    header: 'Status',
    className: 'w-[90px]',
    accessor: (node) =>
      node.status ? (
        <span className="capitalize text-muted-foreground">{node.status.replace(/_/g, ' ')}</span>
      ) : (
        <span className="text-muted-foreground/40">&mdash;</span>
      ),
  },
  {
    header: 'RAG',
    className: 'w-[70px]',
    accessor: (node) =>
      node.rag ? (
        <Badge className={cn('text-xs capitalize', ragBgColor(node.rag))}>
          {node.rag}
        </Badge>
      ) : (
        <span className="text-muted-foreground/40">&mdash;</span>
      ),
  },
  // --- CY Cluster ---
  {
    header: 'Baseline CY',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-foreground">{formatCurrency(node.baseline_cy ?? 0)}</span>
    ),
  },
  {
    header: 'Forecast CY',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-foreground">{formatCurrency(node.forecast_cy ?? 0)}</span>
    ),
  },
  {
    header: 'Actuals YTD',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-foreground">{formatCurrency(node.actuals_cy ?? 0)}</span>
    ),
  },
  // --- Timeline (separator) ---
  {
    header: 'Timeline',
    className: 'w-[130px]',
    accessor: (node) =>
      node.timeline?.start ? (
        <span className="text-muted-foreground text-xs">
          {node.timeline.start} &mdash; {node.timeline.end || '?'}
        </span>
      ) : (
        <span className="text-muted-foreground/40">&mdash;</span>
      ),
  },
  // --- PY Cluster ---
  {
    header: 'Baseline PY',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-muted-foreground">{formatCurrency(node.baseline_py ?? 0)}</span>
    ),
  },
  {
    header: 'Forecast PY',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-muted-foreground">{formatCurrency(node.forecast_py ?? 0)}</span>
    ),
  },
  {
    header: 'Actuals PY',
    className: 'w-[90px] text-right',
    accessor: (node) => (
      <span className="text-muted-foreground">{formatCurrency(node.actuals_py ?? 0)}</span>
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

  const headerGroups: HeaderGroup[] = [
    { label: '', colSpan: 3 },                    // Name, Status, RAG
    { label: 'CY 2026', colSpan: 3, className: 'border-b border-border' },  // Baseline CY, Forecast CY, Actuals YTD
    { label: '', colSpan: 1 },                    // Timeline
    { label: 'Prior Years', colSpan: 3, className: 'border-b border-border' }, // Baseline PY, Forecast PY, Actuals PY
  ];

  return (
    <ExpandableTreeTable
      data={data}
      columns={columns}
      headerGroups={headerGroups}
      onRowClick={(node) => {
        if (node.type === 'project' || node.type === 'service') {
          onProjectSelect(node);
        }
      }}
      selectedId={selectedId}
    />
  );
}
