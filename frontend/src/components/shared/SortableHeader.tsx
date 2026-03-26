import { ChevronDown, ChevronUp } from 'lucide-react';

interface SortableHeaderProps {
  column: string;
  label: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps) {
  const isActive = sortColumn === column;
  const alignClass =
    align === 'right' ? 'text-right justify-end' :
    align === 'center' ? 'text-center justify-center' :
    'text-left';

  return (
    <th
      className={`px-3 py-2 font-medium text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors ${alignClass} ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive ? (
          sortDirection === 'desc' ? (
            <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
          )
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-300" />
        )}
      </span>
    </th>
  );
}
