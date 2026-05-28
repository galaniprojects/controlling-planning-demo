/**
 * ExpandIndicator — standalone +N pill used when we want an
 * indicator detached from a node (e.g. tucked between columns).
 * `EntityNode` includes its own inline ExpandPill for the
 * cap-depth nodes; this component covers the standalone case.
 *
 * Kept as a separate file per the plan-file file map so callers
 * can choose which surface to attach to.
 */
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExpandIndicatorProps {
  x: number;
  y: number;
  /** Number of hidden nodes deeper than the current cap. */
  count: number;
  direction: 'upstream' | 'downstream';
  onClick?: () => void;
}

export function ExpandIndicator({
  x,
  y,
  count,
  direction,
  onClick,
}: ExpandIndicatorProps) {
  const label = `+${count}`;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick?.();
      }}
      role="button"
      aria-label={`Expand ${count} more ${direction} nodes`}
    >
      <foreignObject width={56} height={24} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground',
            'border-2 border-card shadow-sm px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
            'hover:bg-primary/90 transition-colors',
          )}
        >
          <Layers className="h-2.5 w-2.5" />
          <span>{label}</span>
        </div>
      </foreignObject>
    </g>
  );
}
