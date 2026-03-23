import { useState, useEffect, useMemo } from 'react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { useCollapsibleYears, type VisibleColumn } from '@/hooks/useCollapsibleYears';
import { formatMonthShort, isElapsedMonth } from '@/lib/yearColumns';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { OrgHeatmapRow, UtilizationCell } from '@/types/api';
import { UtilizationCellView } from '../shared/UtilizationCell';

interface OrgHeatmapProps {
  pivot: string;
  onRowClick: (row: { id: string; label: string }) => void;
  onCellClick: (row: { id: string; label: string }, month: string) => void;
}

function computeYearSummaryCell(cells: UtilizationCell[], months: string[]): UtilizationCell {
  const matching = cells.filter((c) => months.includes(c.month));
  if (matching.length === 0) {
    return { month: '', value: 0, color: 'amber' };
  }
  const avgPct = matching.reduce((s, c) => s + c.value, 0) / matching.length;
  const totalAlloc = matching.reduce((s, c) => s + (c.allocated_hours ?? 0), 0);
  const totalStd = matching.reduce((s, c) => s + (c.standard_hours ?? 0), 0);
  const color = avgPct > 100 ? 'red' : avgPct >= 90 ? 'amber' : avgPct >= 70 ? 'green' : 'amber';
  return {
    month: `${months[0]?.slice(0, 4)}`,
    value: Math.round(avgPct * 10) / 10,
    color: color as UtilizationCell['color'],
    allocated_hours: Math.round(totalAlloc),
    standard_hours: Math.round(totalStd),
  };
}

export function OrgHeatmap({ pivot, onRowClick, onCellClick }: OrgHeatmapProps) {
  const [data, setData] = useState<OrgHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getOrgHeatmap(pivot)
      .then((res) => setData(res.items))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [pivot]);

  const months = useMemo(
    () => (data.length > 0 ? data[0].utilization.map((c) => c.month) : []),
    [data],
  );

  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(months);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No organization data available.</p>;
  }

  const gridCols = `max-content repeat(${visibleColumns.length}, minmax(56px, 1fr))`;

  // Build a month lookup per row for quick access
  function getCellForColumn(row: OrgHeatmapRow, col: VisibleColumn): UtilizationCell {
    if (col.type === 'month') {
      return row.utilization.find((c) => c.month === col.key) ?? { month: col.key, value: 0, color: 'amber' };
    }
    // Year summary
    return computeYearSummaryCell(row.utilization, col.months);
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-200">
          &nbsp;
        </div>
        {visibleColumns.map((col) =>
          col.type === 'month' ? (
            <div
              key={col.key}
              className={cn(
                'sticky top-0 bg-slate-50 px-1 py-2 text-xs font-medium text-slate-500 text-center border-b border-slate-200',
                isElapsedMonth(col.key) && 'bg-slate-100',
                col.isJanuary && 'border-l border-slate-300',
              )}
            >
              {formatMonthShort(col.key)}
            </div>
          ) : (
            <button
              key={`yr-${col.year}`}
              type="button"
              onClick={() => toggleYear(col.year)}
              className="sticky top-0 bg-slate-100 px-1 py-2 text-xs font-semibold text-slate-600 text-center border-b border-l border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-0.5"
            >
              <ChevronRight className="h-3 w-3" />
              {col.year}
            </button>
          ),
        )}

        {/* Year group headers for expanded years */}
        {yearGroups.some((g) => g.isExpanded && g.months.length > 1) && (
          <>
            <div className="bg-white" />
            {(() => {
              const cells: React.ReactNode[] = [];
              for (const col of visibleColumns) {
                if (col.type === 'yearSummary') {
                  cells.push(<div key={`yh-${col.year}`} />);
                  continue;
                }
                const group = yearGroups.find((g) => g.year === col.year);
                if (group && group.months[0] === col.key) {
                  cells.push(
                    <button
                      key={`yh-exp-${col.year}`}
                      type="button"
                      onClick={() => toggleYear(col.year)}
                      style={{ gridColumn: `span ${group.months.length}` }}
                      className="bg-slate-50 px-1 py-1 text-[10px] font-semibold text-slate-500 text-center hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-0.5 border-b border-slate-100"
                    >
                      <ChevronDown className="h-2.5 w-2.5" />
                      FY {col.year}
                    </button>,
                  );
                }
              }
              return cells;
            })()}
          </>
        )}

        {/* Rows */}
        {data.map((row) => (
          <div key={row.id} className="contents group" role="row">
            <div
              className="flex items-center gap-1 border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50 whitespace-nowrap"
              onClick={() => onRowClick({ id: row.id, label: row.name })}
            >
              {row.name}
            </div>
            {visibleColumns.map((col, i) => {
              const cell = getCellForColumn(row, col);
              return (
                <div
                  key={`${row.id}-${col.type === 'month' ? col.key : `yr-${col.year}`}`}
                  className={cn(
                    'border-b border-slate-100 px-0.5 py-1.5',
                    col.type === 'yearSummary' && 'border-l border-slate-200 bg-slate-50/50',
                    col.type === 'month' && col.isJanuary && 'border-l border-slate-200',
                  )}
                >
                  <UtilizationCellView
                    cell={cell}
                    compact={col.type === 'yearSummary'}
                    onClick={col.type === 'month' ? () => onCellClick({ id: row.id, label: row.name }, col.key) : undefined}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
