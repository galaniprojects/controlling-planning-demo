/**
 * FlowTooltip — small floating card driven by the parent reducer's
 * hover state per `[AF-07]`. Two variants:
 *
 *  - Node hover: cost breakdown (own_cost, effective_cost / inflow).
 *  - Edge hover: percentage + € amount + version context.
 *
 * Positioning is absolute in CSS coordinates (placed by the parent
 * via `style={{ left, top }}`); the parent translates SVG layout
 * positions into screen-relative pixels.
 */
import type { CascadeEdge, CascadeNode } from '@/types/api';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { Card } from '@/components/ui/card';
import { versionPrimaryLabel } from '@/modules/charging/distribution/versions/versionLabels';
import type { DistributionVersionResponse } from '@/types/api';

export interface NodeTooltipProps {
  kind: 'node';
  node: CascadeNode;
  left: number;
  top: number;
}

export interface EdgeTooltipProps {
  kind: 'edge';
  edge: CascadeEdge;
  version: DistributionVersionResponse;
  left: number;
  top: number;
}

export function FlowTooltip(props: NodeTooltipProps | EdgeTooltipProps) {
  return (
    <Card
      className="absolute z-30 px-3 py-2 shadow-lg border-border bg-card text-card-foreground pointer-events-none"
      style={{
        left: props.left,
        top: props.top,
        minWidth: 200,
        maxWidth: 280,
      }}
      role="tooltip"
    >
      {props.kind === 'node' ? (
        <NodeBody node={props.node} />
      ) : (
        <EdgeBody edge={props.edge} version={props.version} />
      )}
    </Card>
  );
}

function NodeBody({ node }: { node: CascadeNode }) {
  const inflow = Math.max(0, node.effective_cost - node.own_cost);
  return (
    <div className="space-y-1.5 text-[11px]">
      <div>
        <div className="text-foreground font-semibold leading-tight">
          {node.entity_name}
        </div>
        <div className="text-muted-foreground font-mono text-[10px]">
          {node.identifier}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Own cost
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {formatCurrency(node.own_cost)}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Inflows
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {formatCurrency(inflow)}
          </div>
        </div>
        <div className="col-span-2 pt-1 border-t border-border">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Effective cost
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {formatCurrency(node.effective_cost)}
          </div>
        </div>
      </div>
    </div>
  );
}

function EdgeBody({
  edge,
  version,
}: {
  edge: CascadeEdge;
  version: DistributionVersionResponse;
}) {
  return (
    <div className="space-y-1.5 text-[11px]">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Share
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {formatPercent(edge.percentage, { signed: false, decimals: 2 })}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Amount
          </div>
          <div className="font-semibold tabular-nums text-foreground">
            {formatCurrency(edge.amount)}
          </div>
        </div>
      </div>
      <div className="pt-1 border-t border-border">
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
          Version
        </div>
        <div className="text-foreground font-medium leading-tight">
          {versionPrimaryLabel(version)}
        </div>
      </div>
      {edge.rationale && (
        <div className="text-[10px] text-muted-foreground italic line-clamp-2">
          “{edge.rationale}”
        </div>
      )}
    </div>
  );
}
