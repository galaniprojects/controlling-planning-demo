/**
 * EntityNode — rounded-rectangle SVG node for upstream / downstream
 * ChargeableEntities in the Allocation Flow.
 *
 * Renders as `<g><foreignObject>...` so the body is a Tailwind div in
 * a real DOM tree. This keeps every colour / border / text class
 * inside the semantic-token vocabulary (`bg-card`, `text-foreground`,
 * `border-border`, etc.) so dark mode and theme switches Just Work —
 * no SVG hex literals required per CLAUDE.md.
 *
 * The coloured left-edge strip uses `entityTypeBadgeClass(type)` so it
 * tracks the InternalService = violet swap done in the wave foundation
 * commit. Subtype palette source of truth is `EntityTypeBadge.tsx`.
 */
import { Layers } from 'lucide-react';
import type { CascadeNode } from '@/types/api';
import {
  EntityTypeBadge,
  entityTypeBadgeClass,
} from '@/components/shared/EntityTypeBadge';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { NODE_H, NODE_W } from '../layout';

export interface EntityNodeProps {
  node: CascadeNode;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Count of hidden upstream/downstream connections — drives the +N pill. */
  hiddenCount?: number;
  hiddenDirection?: 'upstream' | 'downstream';
  isHovered?: boolean;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
  onExpand?: () => void;
}

export function EntityNode({
  node,
  x,
  y,
  w = NODE_W,
  h = NODE_H,
  hiddenCount,
  hiddenDirection,
  isHovered,
  onClick,
  onHoverChange,
  onExpand,
}: EntityNodeProps) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      data-entity-id={node.entity_id}
      className="cursor-pointer"
    >
      <foreignObject width={w} height={h} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          onClick={onClick}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          className={cn(
            'relative h-full w-full rounded-md border bg-card text-card-foreground shadow-sm cursor-pointer overflow-hidden transition-all',
            isHovered
              ? 'border-primary shadow-md ring-1 ring-primary/30'
              : 'border-border hover:border-primary/50',
          )}
        >
          {/* Coloured left strip — reuses the subtype palette. */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-1.5',
              entityTypeBadgeClass(node.entity_type),
            )}
          />

          <div className="pl-3.5 pr-2.5 py-2 flex flex-col h-full">
            <div className="text-[10px] font-mono text-muted-foreground truncate uppercase tracking-wide">
              {node.identifier}
            </div>
            <div className="text-[13px] font-medium text-foreground truncate leading-tight mt-0.5">
              {node.entity_name}
            </div>
            <div className="mt-auto flex items-center gap-1.5">
              <EntityTypeBadge type={node.entity_type} />
              <span className="ml-auto text-[11px] font-semibold tabular-nums text-foreground">
                {formatCurrency(node.effective_cost)}
              </span>
            </div>
          </div>
        </div>
      </foreignObject>

      {/* Hidden-connections +N pill (rendered outside the foreignObject
          so it sits flush against the node edge in SVG coordinates). */}
      {hiddenCount && hiddenCount > 0 && (
        <ExpandPill
          // Position: left side when more upstream lurks, right side when downstream.
          x={hiddenDirection === 'upstream' ? -16 : w - 12}
          y={h / 2 - 12}
          count={hiddenCount}
          onClick={(ev) => {
            ev.stopPropagation();
            onExpand?.();
          }}
        />
      )}
    </g>
  );
}

/** Small inline +N pill rendered as SVG so it overlaps the node corner cleanly. */
function ExpandPill({
  x,
  y,
  count,
  onClick,
}: {
  x: number;
  y: number;
  count: number;
  onClick?: (ev: React.MouseEvent) => void;
}) {
  const label = `+${count}`;
  const w = Math.max(28, 14 + label.length * 8);
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`Expand ${count} hidden`}
    >
      <foreignObject width={w + 16} height={28} overflow="visible">
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground border-2 border-card shadow-sm px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap hover:bg-primary/90 transition-colors"
          title={`${count} more upstream/downstream — click to expand one level`}
        >
          <Layers className="h-2.5 w-2.5" />
          <span>{label}</span>
        </div>
      </foreignObject>
    </g>
  );
}
