/**
 * BusinessNode — stadium / pill-shaped terminal node for a single
 * charging location reached from the focal entity's BTC profile.
 *
 * Amber palette (semantic Tailwind: `bg-amber-100 / text-amber-700 /
 * dark:bg-amber-900/30 / dark:text-amber-400`) signals "cost leaves
 * IT here" — distinct from the rectangular ChargeableEntities and
 * unrelated to the entity-subtype palette.
 */
import { Building2 } from 'lucide-react';
import type { CascadeBusinessTerminal } from '@/types/api';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface BusinessNodeProps {
  terminal: CascadeBusinessTerminal;
  x: number;
  y: number;
  w: number;
  h: number;
  isHovered?: boolean;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

export function BusinessNode({
  terminal,
  x,
  y,
  w,
  h,
  isHovered,
  onClick,
  onHoverChange,
}: BusinessNodeProps) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-business-id={terminal.charging_location_id}
      className="cursor-pointer"
    >
      <foreignObject width={w} height={h} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          onClick={onClick}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          className={cn(
            'flex items-center gap-2 h-full w-full rounded-full border px-3 cursor-pointer transition-shadow',
            'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
            'dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/60 dark:hover:bg-amber-900/40',
            isHovered && 'shadow-md ring-1 ring-amber-400/60',
          )}
          title={`${terminal.name} (${terminal.code})`}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-[11px] font-semibold truncate">
              {terminal.name}
            </span>
            <span className="text-[9px] font-mono uppercase opacity-80 truncate">
              {terminal.code}
            </span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[11px] font-semibold tabular-nums">
              {formatPercent(terminal.percentage, {
                signed: false,
                decimals: 1,
              })}
            </span>
            <span className="text-[9px] tabular-nums opacity-80">
              {formatCurrency(terminal.amount)}
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
