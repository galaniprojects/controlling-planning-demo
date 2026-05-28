/**
 * Service cost summary tile (position 1,2).
 *
 * Own cost + total inflows from upstream + rolled-up effective cost.
 * Non-clickable summary; the full cost-flow breakdown is the Allocation
 * Flow view (Session 4), reachable from tile 1,3.
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { DistributionEffectiveCost } from '@/types/api';

const DEMO_YEAR = 2026;

interface Props {
  entityId: string;
}

export function ServiceCostSummaryTile({ entityId }: Props) {
  const [data, setData] = useState<DistributionEffectiveCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getEntityEffectiveCost(entityId, DEMO_YEAR)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load cost summary');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return (
    <ActionCard title="Cost summary" loading={loading} error={error}>
      {data && (
        <dl className="space-y-2 mt-2">
          <div className="flex items-baseline justify-between">
            <dt className="text-xs text-muted-foreground">Own cost</dt>
            <dd className="text-sm text-foreground tabular-nums">
              {formatCurrency(data.own_cost)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-xs text-muted-foreground">Inflows</dt>
            <dd className="text-sm text-foreground tabular-nums">
              {formatCurrency(data.inflow_total)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between pt-2 border-t border-border">
            <dt className="text-xs font-medium text-foreground">
              Rolled-up total
            </dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
              {formatCurrency(data.effective_cost)}
            </dd>
          </div>
        </dl>
      )}
    </ActionCard>
  );
}
