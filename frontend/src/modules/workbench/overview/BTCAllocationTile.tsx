/**
 * Workbench Overview BTC tile per [E-09].
 *
 * Shows the project's Business-Transfer Charging snapshot for the current
 * year:
 *  - Headline: total To-Business € amount, derived to-business %
 *  - Top 3 charging locations with horizontal % bars
 *  - "+N more" link → opens the BTC tab
 *
 * Empty states:
 *  - No ChargeableEntity linked to this project: shows "No charging entity"
 *  - to_business_pct === 0 and no profile: "No business charging — costs
 *    flow internally" (with optional Distribution link)
 *  - Profile yet to be set: prompt to create profile (controllers see CTA)
 */
import { useEffect, useState } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type {
  ChargeableEntityItem,
  EntityAllocationBreakdownResponse,
} from '@/types/api';

interface Props {
  projectId: string;
  /**
   * Triggered when the user clicks "Open BTC tab" or "+N more". Parent
   * (ProjectWorkspace) switches to the btc tab.
   */
  onOpenBTCTab: () => void;
  /**
   * Triggered when an internal-service-style entity has no business
   * charging — opens the Distribution editor instead.
   */
  onOpenDistributionTab?: () => void;
}

const TOP_LOCATIONS_COUNT = 3;

export function BTCAllocationTile({
  projectId,
  onOpenBTCTab,
  onOpenDistributionTab,
}: Props) {
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);
  const [breakdown, setBreakdown] =
    useState<EntityAllocationBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getEntityByProjectId(projectId)
      .then(async (ent) => {
        if (cancelled) return;
        setEntity(ent);
        try {
          const bd = await chargingApi.getEntityAllocationBreakdown({
            entity_id: ent.id,
            year,
          });
          if (!cancelled) setBreakdown(bd);
        } catch {
          if (!cancelled) setBreakdown(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // No linked chargeable entity is a normal state (some demo
        // projects don't yet have one). Show the muted empty card.
        const msg = e instanceof Error ? e.message : 'Load failed';
        if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
          setEntity(null);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, year]);

  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-5 w-40 mb-3" />
        <Skeleton className="h-12 w-full mb-3" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400 mt-0.5" />
        <p className="text-sm text-red-800 dark:text-red-300">
          Failed to load BTC allocation: {error}
        </p>
      </Card>
    );
  }

  // No chargeable entity → muted empty card.
  if (!entity) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Business-Transfer Charging
        </h3>
        <p className="text-xs text-muted-foreground">
          This project has no charging entity yet. The cost-allocation module
          will create one when the project enters Run.
        </p>
      </Card>
    );
  }

  // Entity exists but no business charging configured (to_business_pct=0
  // and no profile). Surface the Distribution path instead.
  const hasNoBusinessCharging =
    (entity.to_business_pct ?? 0) === 0 ||
    breakdown == null ||
    breakdown.business_amount_total === 0 ||
    !breakdown.has_profile;

  if (hasNoBusinessCharging) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Business-Transfer Charging
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {entity.is_change_or_run}
          </Badge>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {entity.to_business_pct === 0
              ? 'No business charging — costs flow internally via Stage 1 distribution edges.'
              : !breakdown?.has_profile
                ? 'No BTC profile yet for this entity. A controller can create one in the Charging module.'
                : 'No allocations recorded for the current year.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenBTCTab}
              className="h-7 text-xs"
            >
              Open BTC tab
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
            {onOpenDistributionTab && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenDistributionTab}
                className="h-7 text-xs"
              >
                View Stage 1 distribution
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Active state — show top 3 + "+N more".
  const top = breakdown.rows.slice(0, TOP_LOCATIONS_COUNT);
  const remainder = Math.max(0, breakdown.rows.length - TOP_LOCATIONS_COUNT);
  // For the % bars we scale to the largest row.
  const maxPct = Math.max(...top.map((r) => r.percentage), 1);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Business-Transfer Charging · {breakdown.year}
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {entity.is_change_or_run}
        </Badge>
      </div>

      {/* Headline */}
      <div className="flex items-baseline gap-3 mb-4">
        <p className="text-2xl font-semibold text-foreground tabular-nums">
          {formatCurrency(breakdown.business_amount_total)}
        </p>
        <p className="text-xs text-muted-foreground">
          To-Business {breakdown.to_business_pct.toFixed(1)}% of{' '}
          {formatCurrency(breakdown.effective_cost)}
        </p>
      </div>

      {/* Top locations with bars */}
      <div className="space-y-2">
        {top.map((row) => {
          const widthPct = (row.percentage / maxPct) * 100;
          return (
            <div key={row.charging_location_id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span
                  className="truncate text-foreground font-medium"
                  title={row.charging_location_name ?? row.charging_location_id}
                >
                  {row.charging_location_name ?? row.charging_location_id}
                </span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {row.percentage.toFixed(1)}% · {formatCurrency(row.amount_eur)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {remainder > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenBTCTab}
          className="mt-3 h-7 px-2 text-xs"
        >
          +{remainder} more — open BTC tab
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
      {remainder === 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenBTCTab}
          className="mt-3 h-7 px-2 text-xs"
        >
          Open BTC tab
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </Card>
  );
}
