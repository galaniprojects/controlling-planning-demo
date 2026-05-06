import { cn } from '@/lib/utils';
import type { UtilizationCell as CellType } from '@/types/api';

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface UtilizationCellProps {
  cell: CellType;
  onClick?: () => void;
  // v5.1 C-07 — 'fte' renders the value as a 1-decimal FTE-equivalent
  // (e.g. "1.5") instead of an integer percentage. Used by the synthetic
  // External row inside team-heatmap role groups.
  format?: 'percent' | 'fte';
  // Optional tooltip text — used by the External row to expose the
  // FTE-equivalent formula breakdown on hover.
  title?: string;
}

export function UtilizationCellView({
  cell,
  onClick,
  format = 'percent',
  title,
}: UtilizationCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'w-full px-1.5 py-1.5 text-xs text-center rounded transition-colors',
        COLOR_MAP[cell.color] ?? 'bg-muted text-muted-foreground',
        onClick && 'hover:opacity-80 cursor-pointer',
        !onClick && 'cursor-default',
      )}
    >
      {format === 'fte' ? cell.value.toFixed(1) : `${cell.value.toFixed(0)}%`}
    </button>
  );
}
