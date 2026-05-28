/**
 * Entity header card for the rebuilt Distribution Editor (Session 5 spec §5.2).
 *
 * Renders the focal entity's subtype badge, identifier, name, the cost
 * breakdown (own cost + inflows), and the rolled-up total right-aligned
 * in display-size type. The `VersionSelector` slot lives on the right —
 * the editor owns the selector instance (so version switching can
 * trigger refetch + discard) and passes it via children.
 */
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import { formatCurrencyDetailed } from '@/lib/formatters';
import type { CascadeChainResponse } from '@/types/api';

interface Props {
  cascade: CascadeChainResponse;
  /** VersionSelector + create/activate buttons live here. */
  versionSlot?: ReactNode;
  /** True when the focal entity is being edited via simulator handlers. */
  sandboxMode: boolean;
}

export function EntityHeaderCard({ cascade, versionSlot, sandboxMode }: Props) {
  const focal = cascade.focal;
  const inflows = cascade.upstream.length > 0
    ? cascade.edges
        .filter((e) => e.destination_entity_id === focal.entity_id)
        .reduce((s, e) => s + e.amount, 0)
    : 0;
  const ownCost = focal.own_cost;
  const rolledUp = focal.effective_cost;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Identity + cost breakdown */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <EntityTypeBadge type={focal.entity_type} />
            <span className="text-[11px] font-mono text-muted-foreground">
              {focal.identifier}
            </span>
            {sandboxMode && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                scenario sandbox
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-foreground leading-tight">
            {focal.entity_name}
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-md pt-1">
            <span className="text-[11px] text-muted-foreground">Own cost</span>
            <span className="text-[12px] font-mono text-foreground tabular-nums text-right">
              {formatCurrencyDetailed(ownCost)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Inflows ({cascade.upstream.length} upstream)
            </span>
            <span className="text-[12px] font-mono text-foreground tabular-nums text-right">
              {formatCurrencyDetailed(inflows)}
            </span>
          </div>
        </div>

        {/* Rolled-up total + version slot */}
        <div className="flex flex-col items-end gap-3 min-w-[260px]">
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Rolled-up total
            </p>
            <p className="text-2xl font-semibold font-mono text-foreground tabular-nums leading-tight">
              {formatCurrencyDetailed(rolledUp)}
            </p>
          </div>
          {versionSlot && <div className="w-full">{versionSlot}</div>}
        </div>
      </div>
    </Card>
  );
}
