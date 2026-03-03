import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExpandableTreeTable } from '@/components/shared/ExpandableTreeTable';
import { Skeleton } from '@/components/shared/Skeleton';
import type { ScenarioProjectState } from '@/types/api';
import type { TreeTableColumn } from '@/components/shared/ExpandableTreeTable';

interface TreeNode {
  id: string;
  name: string;
  original_budget: number;
  adjusted_budget: number;
  budget_delta: number;
  original_rag: string | null;
  adjusted_rag: string | null;
  is_affected: boolean;
  children?: TreeNode[];
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000)
    return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}K`;
  return `${sign}€${abs.toFixed(0)}`;
}

function RagDot({ rag }: { rag: string | null }) {
  if (!rag) return <span className="h-2.5 w-2.5 rounded-full bg-slate-200 inline-block" />;
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full inline-block ${colors[rag] ?? 'bg-slate-200'}`}
    />
  );
}

interface Props {
  projectStates: ScenarioProjectState[];
  loading: boolean;
}

export function ScenarioPortfolioTree({ projectStates, loading }: Props) {
  const nodes: TreeNode[] = useMemo(
    () =>
      projectStates.map((p) => ({
        id: p.project_id,
        name: p.project_name,
        original_budget: p.original_budget,
        adjusted_budget: p.adjusted_budget,
        budget_delta: p.budget_delta,
        original_rag: p.original_rag,
        adjusted_rag: p.adjusted_rag,
        is_affected: p.is_affected,
      })),
    [projectStates],
  );

  const columns: TreeTableColumn<TreeNode>[] = useMemo(
    () => [
      {
        header: 'Project',
        accessor: (node: TreeNode) => (
          <span className="flex items-center gap-2">
            <span className="text-sm text-slate-900">{node.name}</span>
            {node.is_affected && (
              <Badge className="bg-amber-100 text-amber-600 hover:bg-amber-100 text-[10px] px-1.5 py-0">
                Changed
              </Badge>
            )}
          </span>
        ),
        className: 'min-w-[220px]',
      },
      {
        header: 'Current Budget',
        accessor: (node: TreeNode) => (
          <span className="text-sm text-slate-600">
            {formatCurrency(node.original_budget)}
          </span>
        ),
      },
      {
        header: 'Scenario Budget',
        accessor: (node: TreeNode) => (
          <span
            className={`text-sm font-medium ${node.is_affected ? 'text-slate-900' : 'text-slate-600'}`}
          >
            {formatCurrency(node.adjusted_budget)}
          </span>
        ),
      },
      {
        header: 'Delta',
        accessor: (node: TreeNode) => {
          if (node.budget_delta === 0)
            return <span className="text-xs text-slate-400">—</span>;
          const color =
            node.budget_delta < 0 ? 'text-green-600' : 'text-red-600';
          return (
            <span className={`text-sm font-medium ${color}`}>
              {node.budget_delta > 0 ? '+' : ''}
              {formatCurrency(node.budget_delta)}
            </span>
          );
        },
      },
      {
        header: 'Current RAG',
        accessor: (node: TreeNode) => <RagDot rag={node.original_rag} />,
        className: 'text-center',
      },
      {
        header: 'Scenario RAG',
        accessor: (node: TreeNode) => {
          const changed =
            node.original_rag !== node.adjusted_rag && node.is_affected;
          return (
            <span className={changed ? 'flex items-center gap-1.5' : ''}>
              <RagDot rag={node.adjusted_rag} />
              {changed && (
                <span className="text-[10px] text-amber-600 font-medium">
                  changed
                </span>
              )}
            </span>
          );
        },
        className: 'text-center',
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
        Portfolio Impact ({nodes.length} projects)
      </h4>
      <ExpandableTreeTable data={nodes} columns={columns} />
    </div>
  );
}
