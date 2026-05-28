/**
 * CollapsedBusinessNode — dashed-border pill summarising the
 * additional N business terminals beyond the top-10 threshold per
 * `[AF-04]`. Click navigates to the BTC profile section so the user
 * sees the full distribution.
 */
import { MoreHorizontal } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface CollapsedBusinessNodeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  hiddenCount: number;
  hiddenAmount: number;
  hiddenPct: number;
  isHovered?: boolean;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

export function CollapsedBusinessNode({
  x,
  y,
  w,
  h,
  hiddenCount,
  hiddenAmount,
  hiddenPct,
  isHovered,
  onClick,
  onHoverChange,
}: CollapsedBusinessNodeProps) {
  return (
    <g transform={`translate(${x} ${y})`} className="cursor-pointer">
      <foreignObject width={w} height={h} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          onClick={onClick}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          className={cn(
            'flex items-center gap-2 h-full w-full rounded-full border border-dashed px-3 cursor-pointer transition-shadow',
            'bg-amber-50 text-amber-700 border-amber-400',
            'dark:bg-amber-900/15 dark:text-amber-400 dark:border-amber-700/60',
            'hover:bg-amber-100 dark:hover:bg-amber-900/25',
            isHovered && 'shadow-md ring-1 ring-amber-400/60',
          )}
          title={`Click to open the BTC profile with the full ${hiddenCount + 10}-location distribution`}
        >
          <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-[11px] font-semibold truncate">
              +{hiddenCount} more locations
            </span>
            <span className="text-[9px] uppercase tracking-wide opacity-80 truncate">
              Open BTC profile
            </span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[11px] font-semibold tabular-nums">
              {formatPercent(hiddenPct, { signed: false, decimals: 1 })}
            </span>
            <span className="text-[9px] tabular-nums opacity-80">
              {formatCurrency(hiddenAmount)}
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
