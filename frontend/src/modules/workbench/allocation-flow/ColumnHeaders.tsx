/**
 * ColumnHeaders — the UPSTREAM | FOCAL ENTITY | DOWNSTREAM strip
 * rendered above the SVG canvas per `[AF-09]`. Positioned in SVG
 * coordinates so it scrolls with the rest of the graph when the
 * canvas overflows horizontally.
 */
import { TOP_PAD } from './layout';

export interface ColumnHeadersProps {
  /** X-centre of the focal column. */
  focalCx: number;
  /**
   * Right edge of the upstream-most column (focal's left margin minus
   * the gap). Used to right-align the "UPSTREAM" label.
   */
  upstreamRightX: number;
  /**
   * Left edge of the downstream-most rendered column or the business
   * column (focal's right margin plus the gap).
   */
  downstreamLeftX: number;
  hasUpstream: boolean;
  hasDownstream: boolean;
  hasBusiness: boolean;
  /** Right edge of the business column for the BUSINESS label. */
  businessLeftX?: number;
}

const HEADER_Y = TOP_PAD - 32;

export function ColumnHeaders({
  focalCx,
  upstreamRightX,
  downstreamLeftX,
  hasUpstream,
  hasDownstream,
  hasBusiness,
  businessLeftX,
}: ColumnHeadersProps) {
  return (
    <g aria-hidden>
      {hasUpstream && (
        <text
          x={upstreamRightX}
          y={HEADER_Y}
          textAnchor="end"
          className="fill-muted-foreground text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ fill: 'var(--muted-foreground)' }}
        >
          Upstream
        </text>
      )}
      <text
        x={focalCx}
        y={HEADER_Y}
        textAnchor="middle"
        className="fill-foreground text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ fill: 'var(--foreground)' }}
      >
        Focal Entity
      </text>
      {hasDownstream && (
        <text
          x={downstreamLeftX}
          y={HEADER_Y}
          textAnchor="start"
          className="fill-muted-foreground text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ fill: 'var(--muted-foreground)' }}
        >
          Downstream
        </text>
      )}
      {hasBusiness && businessLeftX !== undefined && (
        <text
          x={businessLeftX}
          y={HEADER_Y}
          textAnchor="start"
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ fill: 'var(--muted-foreground)' }}
        >
          To Business
        </text>
      )}
    </g>
  );
}
