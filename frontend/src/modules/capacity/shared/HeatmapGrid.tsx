import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UtilizationCell } from '@/types/api';
import { UtilizationCellView } from './UtilizationCell';

export interface HeatmapRow {
  id: string;
  label: string;
  utilization: UtilizationCell[];
  children?: HeatmapRow[];
  isAggregate: boolean;
}

interface HeatmapGridProps {
  rows: HeatmapRow[];
  months: string[];
  onRowClick?: (row: HeatmapRow) => void;
  onCellClick?: (row: HeatmapRow, month: string) => void;
  expandable?: boolean;
  defaultExpanded?: Set<string>;
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(month, 10) - 1]} ${year.slice(2)}`;
}

export function HeatmapGrid({
  rows,
  months,
  onRowClick,
  onCellClick,
  expandable = false,
  defaultExpanded,
}: HeatmapGridProps) {
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded ?? new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gridCols = `max-content repeat(${months.length}, minmax(56px, 1fr))`;

  function renderRow(row: HeatmapRow, depth: number) {
    const hasChildren = expandable && row.children && row.children.length > 0;
    const isExpanded = expanded.has(row.id);
    const elements: React.ReactNode[] = [];

    elements.push(
      <div
        key={row.id}
        className="contents group"
        role="row"
      >
        {/* Label cell */}
        <div
          className={cn(
            'flex items-center gap-1 border-b border-slate-100 px-3 py-2 text-sm',
            row.isAggregate ? 'font-medium text-slate-700' : 'text-slate-600',
            (onRowClick && !row.isAggregate) && 'cursor-pointer hover:bg-slate-50',
          )}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
          onClick={() => {
            if (!row.isAggregate && onRowClick) onRowClick(row);
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(row.id);
              }}
              className="p-0.5 rounded hover:bg-slate-200 shrink-0"
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 text-slate-400 transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>
          ) : (
            expandable && <span className="w-4.5 shrink-0" />
          )}
          <span className="whitespace-nowrap">{row.label}</span>
        </div>

        {/* Utilization cells */}
        {row.utilization.map((cell, i) => (
          <div
            key={`${row.id}-${months[i]}`}
            className="border-b border-slate-100 px-0.5 py-1.5"
          >
            <UtilizationCellView
              cell={cell}
              onClick={
                onCellClick
                  ? () => onCellClick(row, months[i])
                  : !row.isAggregate && onRowClick
                    ? () => onRowClick(row)
                    : undefined
              }
            />
          </div>
        ))}
      </div>,
    );

    if (hasChildren && isExpanded) {
      for (const child of row.children!) {
        elements.push(...renderRow(child, depth + 1));
      }
    }

    return elements;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-200">
          &nbsp;
        </div>
        {months.map((m) => (
          <div
            key={m}
            className="sticky top-0 bg-slate-50 px-1 py-2 text-xs font-medium text-slate-500 text-center border-b border-slate-200"
          >
            {formatMonth(m)}
          </div>
        ))}

        {/* Rows */}
        {rows.length > 0 ? (
          rows.flatMap((row) => renderRow(row, 0))
        ) : (
          <div
            className="col-span-full py-8 text-center text-sm text-slate-400"
          >
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
