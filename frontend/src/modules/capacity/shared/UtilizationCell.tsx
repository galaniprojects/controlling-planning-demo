import { cn } from '@/lib/utils';
import type { UtilizationCell as CellType } from '@/types/api';

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};

interface UtilizationCellProps {
  cell: CellType;
  onClick?: () => void;
  compact?: boolean;
}

export function UtilizationCellView({ cell, onClick, compact }: UtilizationCellProps) {
  const hasHours = cell.allocated_hours != null && cell.standard_hours != null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-1.5 py-1.5 text-center rounded transition-colors',
        COLOR_MAP[cell.color] ?? 'bg-slate-100 text-slate-500',
        onClick && 'hover:opacity-80 cursor-pointer',
        !onClick && 'cursor-default',
        hasHours && !compact ? 'text-[10px] leading-tight' : 'text-xs',
      )}
    >
      {hasHours && !compact ? (
        <span>{Math.round(cell.allocated_hours!)}h / {Math.round(cell.standard_hours!)}h &mdash; {cell.value.toFixed(0)}%</span>
      ) : (
        <span>{cell.value.toFixed(0)}%</span>
      )}
    </button>
  );
}
