/**
 * Service allocation flow tile (position 1,3).
 *
 * Compact summary of the cascade chain: count + € totals for upstream
 * inflows, downstream allocations, and To Business terminals. Click
 * navigates to the Allocation Flow full-page view (Session 4; routed
 * to a stub in Wave A so deep-links don't 404 — Session 4 lands the
 * SVG visualization at the same path).
 */
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { CascadeChainResponse } from '@/types/api';

interface Props {
  entityId: string;
  onClick: () => void;
}

export function ServiceAllocationFlowTile({ entityId, onClick }: Props) {
  const [data, setData] = useState<CascadeChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getCascadeChain(entityId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load cascade');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  // Sum direct-edge amounts in/out of the focal entity. The cascade response
  // includes the transitive node lists; the edge list itself is the entire
  // sub-graph, so we filter to the focal's direct edges.
  let inflowTotal = 0;
  let outflowTotal = 0;
  let businessTotal = 0;
  let upstreamCount = 0;
  let downstreamCount = 0;
  let businessCount = 0;
  if (data) {
    upstreamCount = data.upstream.length;
    downstreamCount = data.downstream.length;
    businessCount = data.business_terminals.length;
    for (const e of data.edges) {
      if (e.destination_entity_id === data.focal.entity_id) {
        inflowTotal += e.amount;
      } else if (e.source_entity_id === data.focal.entity_id) {
        outflowTotal += e.amount;
      }
    }
    for (const bt of data.business_terminals) {
      businessTotal += bt.amount;
    }
  }

  return (
    <ActionCard
      title="Allocation flow"
      loading={loading}
      error={error}
      onClick={onClick}
    >
      {data && (
        <div className="space-y-2 mt-2 text-xs">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="text-right">
              <div className="font-medium text-foreground tabular-nums">
                {upstreamCount}
              </div>
              <div className="text-[10px] text-muted-foreground">upstream</div>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="text-left">
              <div className="font-medium text-foreground tabular-nums">
                {downstreamCount}
              </div>
              <div className="text-[10px] text-muted-foreground">downstream</div>
            </div>
          </div>
          <dl className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-muted-foreground">Inflows €</dt>
              <dd className="tabular-nums text-foreground">
                {formatCurrency(inflowTotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-muted-foreground">Outflows €</dt>
              <dd className="tabular-nums text-foreground">
                {formatCurrency(outflowTotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-[11px] text-muted-foreground">
                To Business € ({businessCount})
              </dt>
              <dd className="tabular-nums text-foreground">
                {formatCurrency(businessTotal)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </ActionCard>
  );
}
