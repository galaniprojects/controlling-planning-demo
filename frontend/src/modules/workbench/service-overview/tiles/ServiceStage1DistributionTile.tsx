/**
 * Stage 1 distribution tile (position 2,1).
 *
 * Shows the focal entity's outgoing percentage split: to-business %,
 * self-retained %, and top recipient entities. Click navigates to the
 * existing Distribution editor (Session 5 redesigns it in place).
 *
 * Wave A note: the Charging module's DistributionListView does not yet
 * read an entity from the URL; landing on the right section is the
 * best we can do without modifying that view. Session 5 may add a
 * `?entity=<id>` deep-link param.
 */
import { useEffect, useState } from 'react';
import { ActionCard } from '@/components/shared/ActionCard';
import { chargingApi } from '@/api/endpoints';
import { formatPercent } from '@/lib/formatters';
import type { EntityDistributionSummary } from '@/types/api';

interface Props {
  entityId: string;
  onClick: () => void;
}

export function ServiceStage1DistributionTile({ entityId, onClick }: Props) {
  const [data, setData] = useState<EntityDistributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getEntityDistributionSummary(entityId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load distribution');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const topThree = data
    ? [...data.distributions]
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3)
    : [];

  return (
    <ActionCard
      title="Stage 1 distribution"
      loading={loading}
      error={error}
      onClick={onClick}
    >
      {data && (
        <div className="space-y-3 mt-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                To Business
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {formatPercent(data.to_business_pct, { signed: false })}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Self-retained
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {formatPercent(data.self_retained_pct, { signed: false })}
              </dd>
            </div>
          </dl>
          {topThree.length > 0 ? (
            <ul className="space-y-1 pt-2 border-t border-border">
              {topThree.map((edge) => (
                <li
                  key={edge.id}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span
                    className="text-foreground truncate"
                    title={edge.destination_entity_name ?? edge.destination_entity_id}
                  >
                    {edge.destination_entity_name ?? edge.destination_entity_id}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatPercent(edge.percentage, { signed: false })}
                  </span>
                </li>
              ))}
              {data.distributions.length > 3 && (
                <li className="text-[10px] text-muted-foreground/80 italic">
                  + {data.distributions.length - 3} more
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              No outgoing distribution edges.
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
