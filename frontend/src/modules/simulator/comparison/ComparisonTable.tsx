import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ComparisonColumn } from '@/types/api';
import { formatCurrency, formatCurrencyDelta } from '@/lib/formatters';

function RagDot({ rag }: { rag: string | null }) {
  if (!rag)
    return (
      <span className="h-2 w-2 rounded-full bg-slate-200 inline-block" />
    );
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <span
      className={`h-2 w-2 rounded-full inline-block ${colors[rag] ?? 'bg-slate-200'}`}
    />
  );
}

interface ComparisonTableProps {
  columns: ComparisonColumn[];
}

export function ComparisonTable({ columns }: ComparisonTableProps) {
  // Union of all project IDs across columns, sorted by name
  const projectRows = useMemo(() => {
    const idMap = new Map<string, string>();
    for (const col of columns) {
      for (const [pid, d] of Object.entries(col.data)) {
        if (!idMap.has(pid)) idMap.set(pid, d.name);
      }
    }
    return Array.from(idMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [columns]);

  // Calculate column totals
  const columnTotals = useMemo(
    () =>
      columns.map((col) =>
        Object.values(col.data).reduce((sum, d) => sum + d.budget, 0),
      ),
    [columns],
  );

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Project</TableHead>
            {columns.map((col, i) => (
              <TableHead key={i} className="text-right min-w-[140px]">
                <div>
                  <p className="font-medium">{col.label}</p>
                  <p className="text-xs text-slate-400 font-normal">
                    {formatCurrency(columnTotals[i])}
                  </p>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {projectRows.map(([pid, name]) => (
            <TableRow key={pid}>
              <TableCell className="text-sm font-medium text-slate-900">
                {name}
              </TableCell>
              {columns.map((col, i) => {
                const d = col.data[pid];
                if (!d) {
                  return (
                    <TableCell key={i} className="text-right">
                      <span className="text-slate-300">—</span>
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={i} className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <RagDot rag={d.rag} />
                      <span className="text-sm text-slate-700">
                        {formatCurrency(d.budget)}
                      </span>
                    </div>
                    {d.delta !== undefined && d.delta !== 0 && (
                      <span
                        className={`text-xs ${d.delta < 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {formatCurrencyDelta(d.delta)}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
