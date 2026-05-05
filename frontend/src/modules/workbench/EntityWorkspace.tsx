/**
 * EntityWorkspace — Workbench detail view for non-Project chargeable
 * entities (Offerings + InternalServices) per Wave 5 F7 / [E-11].
 *
 * Projects keep the existing 4-tab `ProjectWorkspace` view (Overview /
 * Forecast / BTC / History). Non-Project entities have no forecast or
 * change-request stream, so this lighter workspace exposes:
 *
 *   - A small header strip (identifier · type · responsible · annual cost)
 *   - The Cost Allocation / Distribution tab (single canonical surface),
 *     which is the same per-entity view used by Projects' BTC tab — built
 *     by reusing `WorkbenchBTCTab` in `entityId` mode.
 *
 * Routing into this view: `/workbench?entity=<id>&type=<offering|internal_service>`
 * (the `type` segment is informational; the entity record on the server
 * carries the canonical `entity_type`).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkbenchBTCTab } from './btc/WorkbenchBTCTab';
import { chargingApi } from '@/api/endpoints';
import { formatPercent, formatCurrency } from '@/lib/formatters';
import type { ChargeableEntityItem } from '@/types/api';

interface Props {
  entityId: string;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return formatPercent(n, { signed: false });
}

function fmtEur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return formatCurrency(n);
}

function entityTypeLabel(type: string): string {
  if (type === 'Offering') return 'Offering';
  if (type === 'InternalService') return 'Internal Service';
  return type;
}

export function EntityWorkspace({ entityId }: Props) {
  const navigate = useNavigate();
  const [entity, setEntity] = useState<ChargeableEntityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // v5.1 [A-01 fix] — top-level Back to Run Portfolio. EntityWorkspace is
  // routed via /workbench?entity=<id>&type=<...> from the Run Portfolio list,
  // so the back affordance has to navigate the URL itself. The inner
  // EntityDistributionEditor / EntityBTCProfileEditor each render their own
  // Back button only when the parent passes `onBack` — Workbench callers
  // omit it so the inner buttons are suppressed and this top-level button
  // is the single source of truth. navigate(-1) preserves filter + scroll
  // state from the Run list, falling forward to /portfolio/run if there's
  // no history entry.
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/portfolio/run');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getEntity(entityId)
      .then((ent) => {
        if (!cancelled) setEntity(ent);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load entity');
        setEntity(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="space-y-3">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Run Portfolio
          </Button>
        </div>
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700 dark:text-red-400 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Entity unavailable
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">
              {error ?? 'No chargeable entity matches this id.'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // The BTC/Distribution tab already adapts its label based on the entity's
  // To-Business share (F6); we mirror that semantics in the tab strip.
  const btcTabLabel =
    (entity.to_business_pct ?? 0) > 0 ? 'Cost Allocation' : 'Distribution';

  return (
    <div className="space-y-4">
      {/* v5.1 [A-01 fix] — Back to Run Portfolio. Sits above the entity
          header strip so it's the first interactive element on the page. */}
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to Run Portfolio
        </Button>
      </div>
      {/* Entity header strip */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {entity.name}
              </h2>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 whitespace-nowrap">
                {entityTypeLabel(entity.entity_type)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {entity.identifier}
            </p>
            {entity.description ? (
              <p className="text-xs text-muted-foreground max-w-prose">
                {entity.description}
              </p>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs flex-shrink-0">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Annual cost
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {fmtEur(entity.annual_cost)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                To-Business
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {fmtPct(entity.to_business_pct)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Termination
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {entity.termination_month ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      {/* Single tab — kept as Tabs shell for visual parity with ProjectWorkspace */}
      <Tabs defaultValue="btc">
        <TabsList>
          <TabsTrigger value="btc">{btcTabLabel}</TabsTrigger>
        </TabsList>
        <TabsContent value="btc" className="mt-4 min-w-0">
          <WorkbenchBTCTab entityId={entity.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
