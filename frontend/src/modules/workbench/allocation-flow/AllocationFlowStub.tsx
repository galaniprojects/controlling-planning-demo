/**
 * Allocation Flow stub — placeholder route component for Service
 * Workbench Session 4.
 *
 * Wave A lands this stub so tile 1,3 ("Allocation flow") in the
 * service tile grid has a working click target — landing on a
 * branded "coming next" page rather than a 404. Session 4 replaces
 * the body with the SVG-based DAG visualization at the same path.
 *
 * Route: `/workbench/allocation-flow?entity=<chargeable_entity_id>`
 *
 * The stub validates the entity param by hitting the cascade
 * endpoint — so we surface a realistic header with the focal name +
 * counts even before the visualisation lands. If the entity is
 * unreachable (404, unknown id) we render a small error card.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GitMerge } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { CascadeChainResponse } from '@/types/api';

export function AllocationFlowStub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entityId = searchParams.get('entity');
  const [data, setData] = useState<CascadeChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) {
      setLoading(false);
      setError('Missing entity parameter.');
      return;
    }
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

  const back = () => {
    if (entityId) {
      navigate(`/workbench?entity=${entityId}`);
    } else {
      navigate('/workbench');
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Workbench"
        breadcrumb={
          data ? <>Workbench &rsaquo; {data.focal.entity_name} &rsaquo; Allocation Flow</> : <>Workbench &rsaquo; Allocation Flow</>
        }
        actions={<ModuleGuideButton moduleId="project_workbench" />}
      />

      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to Workbench
        </Button>
      </div>

      {loading && (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {!loading && error && (
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Allocation flow unavailable
          </p>
          <p className="text-xs text-red-700 dark:text-red-400 mt-1">{error}</p>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {/* Focal entity strip — derived from cascade response so we don't
              need a separate entity fetch. */}
          <Card className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {data.focal.entity_name}
                  </h2>
                  <EntityTypeBadge type={data.focal.entity_type} />
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {data.focal.identifier}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs flex-shrink-0">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Effective cost
                  </dt>
                  <dd className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(data.focal.effective_cost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Own cost
                  </dt>
                  <dd className="text-sm font-semibold text-foreground tabular-nums">
                    {formatCurrency(data.focal.own_cost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Chain depth cap
                  </dt>
                  <dd className="text-sm font-semibold text-foreground tabular-nums">
                    {data.max_allocation_depth}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card className="p-6">
            <EmptyState
              icon={GitMerge}
              title="Allocation flow visualization — coming next session"
              description={`Cascade resolved: ${data.upstream.length} upstream · ${data.downstream.length} downstream · ${data.business_terminals.length} business terminals. The full SVG DAG view lands in Service Workbench Session 4.`}
              size="md"
            />
          </Card>
        </>
      )}
    </div>
  );
}
