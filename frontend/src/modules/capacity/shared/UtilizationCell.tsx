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
}

export function UtilizationCellView({ cell, onClick }: UtilizationCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-1.5 py-1.5 text-xs text-center rounded transition-colors',
        COLOR_MAP[cell.color] ?? 'bg-slate-100 text-slate-500',
        onClick && 'hover:opacity-80 cursor-pointer',
        !onClick && 'cursor-default',
      )}
    >
      {cell.value.toFixed(0)}%
    </button>
  );
}
