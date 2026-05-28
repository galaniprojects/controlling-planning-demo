/**
 * AllocationFlowView — full-page SVG DAG visualisation of an
 * entity's cascading allocation chain. Replaces `AllocationFlowStub`
 * at the `/workbench/allocation-flow?entity=<id>` route.
 *
 * The outer shell (ModuleHeader, back button, focal-entity strip,
 * cascade fetch via chargingApi.getCascadeChain) is preserved
 * verbatim from the stub so navigation behaviour stays stable; the
 * stub's EmptyState placeholder is replaced by the SVG canvas.
 *
 * Layout / depth / hover state lives in `useAllocationFlowState`.
 * Pure layout maths in `layout.ts` + `edgeGeometry.ts`. Tooltips,
 * legend, version selector, and ShowFullChainToggle land in the
 * follow-up commit.
 *
 * Decision references:
 *  - `[AF-01]` left→right DAG, focal centred
 *  - `[AF-06]` ±1 default, +N indicator drives one-step expand
 *  - `[AF-07]` node click → workbench, business click → BTC profile
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { CascadeChainResponse } from '@/types/api';

import { buildLayout, FOCAL_NODE_W } from './layout';
import { edgeKey } from './edgeGeometry';
import { useAllocationFlowState } from './useAllocationFlowState';
import { ColumnHeaders } from './ColumnHeaders';
import { EntityNode } from './nodes/EntityNode';
import { FocalEntityNode } from './nodes/FocalEntityNode';
import { SelfRetainedBadge } from './nodes/SelfRetainedBadge';
import { BusinessNode } from './nodes/BusinessNode';
import { CollapsedBusinessNode } from './nodes/CollapsedBusinessNode';
import { CascadeEdge } from './edges/CascadeEdge';

export function AllocationFlowView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entityId = searchParams.get('entity');

  const [data, setData] = useState<CascadeChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { state, dispatch } = useAllocationFlowState(entityId);

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
    if (window.history.length > 1) {
      navigate(-1);
    } else if (entityId) {
      navigate(`/workbench?entity=${entityId}`);
    } else {
      navigate('/workbench');
    }
  };

  const layout = useMemo(() => {
    if (!data) return null;
    return buildLayout(data, state.expandedDepthUp, state.expandedDepthDown);
  }, [data, state.expandedDepthUp, state.expandedDepthDown]);

  // Quick lookup: entity_id → its rendered position (for edge endpoints).
  const positionById = useMemo(() => {
    const m = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();
    if (!layout) return m;
    m.set(layout.focal.node.entity_id, layout.focal);
    for (const p of layout.upstream) m.set(p.node.entity_id, p);
    for (const p of layout.downstream) m.set(p.node.entity_id, p);
    return m;
  }, [layout]);

  return (
    <div className="px-6 py-6 space-y-4">
      <ModuleHeader
        title="Workbench"
        breadcrumb={
          data ? (
            <>
              Workbench &rsaquo; {data.focal.entity_name} &rsaquo; Allocation
              Flow
            </>
          ) : (
            <>Workbench &rsaquo; Allocation Flow</>
          )
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

      {!loading && !error && data && layout && (
        <>
          <FocalStrip data={data} />

          {/* Soft empty when the focal is fully isolated. */}
          {layout.upstream.length === 0 &&
            layout.downstream.length === 0 &&
            layout.business.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No allocations on this entity.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This focal entity has no upstream sources, downstream
                  recipients, or business terminals in the selected version.
                </p>
              </Card>
            )}

          <Card className="p-0 overflow-x-auto overflow-y-hidden">
            <svg
              role="img"
              aria-label="Allocation flow diagram"
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="block"
              style={{ minWidth: '100%' }}
            >
              <ColumnHeaders
                focalCx={layout.focal.x + FOCAL_NODE_W / 2}
                upstreamRightX={layout.focal.x - 20}
                downstreamLeftX={layout.focal.x + FOCAL_NODE_W + 20}
                hasUpstream={layout.upstream.length > 0}
                hasDownstream={layout.downstream.length > 0}
                hasBusiness={layout.business.length > 0}
                businessLeftX={
                  layout.business[0] ? layout.business[0].x : undefined
                }
              />

              {/* Soft-empty labels for missing side columns. */}
              {layout.upstream.length === 0 && (
                <text
                  x={layout.focal.x - 32}
                  y={layout.focal.y + layout.focal.h / 2}
                  textAnchor="end"
                  className="text-[10px] italic"
                  style={{ fill: 'var(--muted-foreground)' }}
                >
                  No upstream entities — focal is a root.
                </text>
              )}
              {layout.downstream.length === 0 && layout.business.length === 0 && (
                <text
                  x={layout.focal.x + FOCAL_NODE_W + 32}
                  y={layout.focal.y + layout.focal.h / 2}
                  textAnchor="start"
                  className="text-[10px] italic"
                  style={{ fill: 'var(--muted-foreground)' }}
                >
                  No downstream allocations yet.
                </text>
              )}

              {/* Edges (rendered first so node bodies sit on top). */}
              {layout.edges.map((e) => {
                const src = positionById.get(e.source_entity_id);
                const dst = positionById.get(e.destination_entity_id);
                if (!src || !dst) return null;
                const key = edgeKey(e.source_entity_id, e.destination_entity_id);
                return (
                  <CascadeEdge
                    key={key}
                    src={src}
                    dst={dst}
                    percentage={e.percentage}
                    amount={e.amount}
                    maxAmount={layout.maxEdgeAmount}
                    emphasised={state.hoverEdgeKey === key}
                    onMouseEnter={() =>
                      dispatch({ type: 'set_hover_edge', key })
                    }
                    onMouseLeave={() =>
                      dispatch({ type: 'set_hover_edge', key: null })
                    }
                  />
                );
              })}

              {/* Upstream column(s). */}
              {layout.upstream.map((p) => (
                <EntityNode
                  key={p.node.entity_id}
                  node={p.node}
                  x={p.x}
                  y={p.y}
                  w={p.w}
                  h={p.h}
                  hiddenCount={layout.hiddenUpstreamCount.get(p.node.entity_id)}
                  hiddenDirection="upstream"
                  isHovered={state.hoverNodeId === p.node.entity_id}
                  onHoverChange={(h) =>
                    dispatch({
                      type: 'set_hover_node',
                      id: h ? p.node.entity_id : null,
                    })
                  }
                  onClick={() => navigate(`/workbench?entity=${p.node.entity_id}`)}
                  onExpand={() => dispatch({ type: 'expand_up' })}
                />
              ))}

              {/* Downstream column(s). */}
              {layout.downstream.map((p) => (
                <EntityNode
                  key={p.node.entity_id}
                  node={p.node}
                  x={p.x}
                  y={p.y}
                  w={p.w}
                  h={p.h}
                  hiddenCount={layout.hiddenDownstreamCount.get(p.node.entity_id)}
                  hiddenDirection="downstream"
                  isHovered={state.hoverNodeId === p.node.entity_id}
                  onHoverChange={(h) =>
                    dispatch({
                      type: 'set_hover_node',
                      id: h ? p.node.entity_id : null,
                    })
                  }
                  onClick={() => navigate(`/workbench?entity=${p.node.entity_id}`)}
                  onExpand={() => dispatch({ type: 'expand_down' })}
                />
              ))}

              {/* Focal + self-retained badge. */}
              <FocalEntityNode
                node={layout.focal.node}
                x={layout.focal.x}
                y={layout.focal.y}
                w={layout.focal.w}
                h={layout.focal.h}
                isHovered={state.hoverNodeId === layout.focal.node.entity_id}
                onHoverChange={(h) =>
                  dispatch({
                    type: 'set_hover_node',
                    id: h ? layout.focal.node.entity_id : null,
                  })
                }
              />
              {layout.focal.node.self_retained_pct > 0 && (
                <SelfRetainedBadge
                  x={layout.selfRetained.x}
                  y={layout.selfRetained.y}
                  w={layout.selfRetained.w}
                  selfRetainedPct={layout.focal.node.self_retained_pct}
                  selfRetainedAmount={
                    (layout.focal.node.effective_cost *
                      layout.focal.node.self_retained_pct) /
                    100
                  }
                />
              )}

              {/* Business terminal column. */}
              {layout.business.map((b) =>
                b.kind === 'terminal' ? (
                  <BusinessNode
                    key={b.terminal.charging_location_id}
                    terminal={b.terminal}
                    x={b.x}
                    y={b.y}
                    w={b.w}
                    h={b.h}
                    isHovered={
                      state.hoverNodeId === b.terminal.charging_location_id
                    }
                    onHoverChange={(h) =>
                      dispatch({
                        type: 'set_hover_node',
                        id: h ? b.terminal.charging_location_id : null,
                      })
                    }
                    onClick={() => navigate('/charging?section=btc')}
                  />
                ) : (
                  <CollapsedBusinessNode
                    key="collapsed-business"
                    x={b.x}
                    y={b.y}
                    w={b.w}
                    h={b.h}
                    hiddenCount={b.hiddenCount}
                    hiddenAmount={b.hiddenAmount}
                    hiddenPct={b.hiddenPct}
                    isHovered={state.hoverNodeId === '__collapsed_business__'}
                    onHoverChange={(h) =>
                      dispatch({
                        type: 'set_hover_node',
                        id: h ? '__collapsed_business__' : null,
                      })
                    }
                    onClick={() => navigate('/charging?section=btc')}
                  />
                ),
              )}
            </svg>
          </Card>
        </>
      )}
    </div>
  );
}

// === Focal strip — preserved from AllocationFlowStub ===

function FocalStrip({ data }: { data: CascadeChainResponse }) {
  return (
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
  );
}
