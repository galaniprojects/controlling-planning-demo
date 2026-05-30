/**
 * ColumnHeaders — the UPSTREAM | FOCAL ENTITY | DOWNSTREAM strip
 * rendered inside the SVG canvas per `[AF-09]`. Positioned in SVG
 * coordinates so it scrolls with the rest of the graph when the
 * canvas overflows.
 *
 * Horizontal: the three labels sit in a top strip, X-positioned
 * (upstream right-aligned, focal centred, downstream/business
 * left-aligned). Vertical (§10.3 axis-swap): the labels are
 * Y-positioned along the depth axis (top=UPSTREAM, mid=FOCAL,
 * bottom=DOWNSTREAM, business below), left-anchored in the
 * sibling-start gutter.
 */
import type { FlowOrientation } from './layout';
import { SIDE_PAD, TOP_PAD } from './layout';

export interface ColumnHeadersProps {
  orientation?: FlowOrientation;
  hasUpstream: boolean;
  hasDownstream: boolean;
  hasBusiness: boolean;

  // --- Horizontal anchors (X-positioned, top strip) ---
  /** X-centre of the focal column. */
  focalCx?: number;
  /**
   * Right edge of the upstream-most column (focal's left margin minus
   * the gap). Used to right-align the "UPSTREAM" label.
   */
  upstreamRightX?: number;
  /**
   * Left edge of the downstream-most rendered column (focal's right
   * margin plus the gap).
   */
  downstreamLeftX?: number;
  /** Left edge of the business column for the BUSINESS label. */
  businessLeftX?: number;

  // --- Vertical anchors (Y-positioned, left gutter) ---
  /** Y-centre of the focal band. */
  focalCy?: number;
  /** Y for the UPSTREAM label (above the upstream rows). */
  upstreamTopY?: number;
  /** Y for the DOWNSTREAM label (below the focal, over downstream rows). */
  downstreamY?: number;
  /** Y for the business label. */
  businessY?: number;
}

const HEADER_Y = TOP_PAD - 32;
const LABEL_CLASS =
  'text-[10px] uppercase tracking-[0.18em] font-semibold';

export function ColumnHeaders(props: ColumnHeadersProps) {
  if (props.orientation === 'vertical') {
    return <VerticalHeaders {...props} />;
  }
  return <HorizontalHeaders {...props} />;
}

function HorizontalHeaders({
  focalCx = 0,
  upstreamRightX = 0,
  downstreamLeftX = 0,
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
          className={LABEL_CLASS}
          style={{ fill: 'var(--muted-foreground)' }}
        >
          Upstream
        </text>
      )}
      <text
        x={focalCx}
        y={HEADER_Y}
        textAnchor="middle"
        className={LABEL_CLASS}
        style={{ fill: 'var(--foreground)' }}
      >
        Focal Entity
      </text>
      {hasDownstream && (
        <text
          x={downstreamLeftX}
          y={HEADER_Y}
          textAnchor="start"
          className={LABEL_CLASS}
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
          className={LABEL_CLASS}
          style={{ fill: 'var(--muted-foreground)' }}
        >
          To Business
        </text>
      )}
    </g>
  );
}

function VerticalHeaders({
  focalCy = 0,
  upstreamTopY = 0,
  downstreamY = 0,
  businessY,
  hasUpstream,
  hasDownstream,
  hasBusiness,
}: ColumnHeadersProps) {
  const x = SIDE_PAD - 12;
  return (
    <g aria-hidden>
      {hasUpstream && (
        <text
          x={x}
          y={upstreamTopY}
          textAnchor="start"
          className={LABEL_CLASS}
          style={{ fill: 'var(--muted-foreground)' }}
        >
          Upstream
        </text>
      )}
      <text
        x={x}
        y={focalCy}
        textAnchor="start"
        className={LABEL_CLASS}
        style={{ fill: 'var(--foreground)' }}
      >
        Focal Entity
      </text>
      {hasDownstream && (
        <text
          x={x}
          y={downstreamY}
          textAnchor="start"
          className={LABEL_CLASS}
          style={{ fill: 'var(--muted-foreground)' }}
        >
          Downstream
        </text>
      )}
      {hasBusiness && businessY !== undefined && (
        <text
          x={x}
          y={businessY}
          textAnchor="start"
          className={LABEL_CLASS}
          style={{ fill: 'var(--muted-foreground)' }}
        >
          To Business
        </text>
      )}
    </g>
  );
}
