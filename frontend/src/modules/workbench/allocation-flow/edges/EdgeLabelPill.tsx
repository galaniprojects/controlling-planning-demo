/**
 * EdgeLabelPill — two-line semi-transparent pill anchored at the
 * t=0.5 midpoint of the cascade edge per `[AF-05]`. Percentage on
 * the top line (primary), € amount below (secondary). Uses
 * `<foreignObject>` so we keep semantic-token classes inside the
 * SVG canvas.
 */
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface EdgeLabelPillProps {
  cx: number;
  cy: number;
  percentage: number;
  amount: number;
  emphasised?: boolean;
  /** Forwarded so hover propagates from label back to parent edge. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const PILL_W = 70;
const PILL_H = 30;

export function EdgeLabelPill({
  cx,
  cy,
  percentage,
  amount,
  emphasised,
  onMouseEnter,
  onMouseLeave,
}: EdgeLabelPillProps) {
  return (
    <g
      transform={`translate(${cx - PILL_W / 2} ${cy - PILL_H / 2})`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <foreignObject width={PILL_W} height={PILL_H} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className={cn(
            'flex flex-col items-center justify-center rounded-md backdrop-blur-sm border px-1.5 py-0.5 leading-tight',
            'bg-card/80 border-border text-foreground',
            emphasised && 'border-primary shadow-md bg-card',
          )}
        >
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              emphasised ? 'text-primary' : 'text-foreground',
            )}
          >
            {formatPercent(percentage, { signed: false, decimals: 1 })}
          </span>
          <span className="text-[9px] tabular-nums text-muted-foreground">
            {formatCurrency(amount)}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}
