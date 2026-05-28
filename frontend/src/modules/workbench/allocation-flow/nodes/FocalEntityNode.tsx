/**
 * FocalEntityNode — the centred, accent-bordered rectangle.
 *
 * Same shape vocabulary as `EntityNode` but rendered slightly larger,
 * with the CRETA accent (`border-orange-500`, already in the Tailwind
 * config) on all four sides plus a subtle warm background tint.
 * Surfaces own_cost AND effective_cost so the user sees the roll-up
 * vs. self-only delta at a glance.
 */
import type { CascadeNode } from '@/types/api';
import {
  EntityTypeBadge,
  entityTypeBadgeClass,
} from '@/components/shared/EntityTypeBadge';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { FOCAL_NODE_H, FOCAL_NODE_W } from '../layout';

export interface FocalEntityNodeProps {
  node: CascadeNode;
  x: number;
  y: number;
  w?: number;
  h?: number;
  isHovered?: boolean;
  onHoverChange?: (hovering: boolean) => void;
}

export function FocalEntityNode({
  node,
  x,
  y,
  w = FOCAL_NODE_W,
  h = FOCAL_NODE_H,
  isHovered,
  onHoverChange,
}: FocalEntityNodeProps) {
  return (
    <g transform={`translate(${x} ${y})`} data-focal-id={node.entity_id}>
      <foreignObject width={w} height={h} overflow="visible">
        <div
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
          className={cn(
            'relative h-full w-full rounded-lg border-2 bg-orange-50/40 dark:bg-orange-900/10 text-card-foreground shadow-md overflow-hidden',
            'border-orange-500',
            isHovered && 'ring-2 ring-orange-400/40',
          )}
          title="Focal entity (current cascade target)"
        >
          {/* Coloured left strip — matches subtype palette. */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-2',
              entityTypeBadgeClass(node.entity_type),
            )}
          />

          <div className="pl-4 pr-3 py-2.5 flex flex-col h-full">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Focal
              </span>
              <EntityTypeBadge type={node.entity_type} />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground truncate mt-1 uppercase tracking-wide">
              {node.identifier}
            </div>
            <div className="text-sm font-semibold text-foreground truncate leading-tight">
              {node.entity_name}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-x-2 text-[10px]">
              <div className="flex flex-col">
                <span className="text-muted-foreground uppercase tracking-wide text-[9px]">
                  Own cost
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(node.own_cost)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground uppercase tracking-wide text-[9px]">
                  Total in
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(node.effective_cost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
