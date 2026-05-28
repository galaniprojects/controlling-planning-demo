/**
 * SelfRetainedBadge — small dashed-border tag pinned under the focal
 * node, surfacing the share of inflow the entity keeps for its own
 * cost centre rather than redistributing further. Sits at
 * `layout.selfRetained` per the layout engine.
 */
import { formatCurrency } from '@/lib/formatters';
import { formatPercent } from '@/lib/formatters';

export interface SelfRetainedBadgeProps {
  x: number;
  y: number;
  w: number;
  /** 0..100 — pre-cycle-detection share retained by the focal. */
  selfRetainedPct: number;
  selfRetainedAmount: number;
}

export function SelfRetainedBadge({
  x,
  y,
  w,
  selfRetainedPct,
  selfRetainedAmount,
}: SelfRetainedBadgeProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <foreignObject width={w} height={28} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/50 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
          title="Share retained by the focal entity for its own cost centre"
        >
          <span className="uppercase tracking-wider font-semibold">
            Self-retained
          </span>
          <span className="tabular-nums font-semibold text-foreground">
            {formatPercent(selfRetainedPct, { signed: false, decimals: 1 })}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-foreground">
            {formatCurrency(selfRetainedAmount)}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}
