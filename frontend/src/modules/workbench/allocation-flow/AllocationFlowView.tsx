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
 * Pure layout maths in `layout.ts` + `edgeGeometry.ts`. Toolbar above
 * the canvas hosts the VersionSelector + ShowFullChainToggle + legend
 * trigger; the FlowLegend overlays the canvas top-right per [AF-08].
 *
 * Decision references:
 *  - `[AF-01]` left→right DAG, focal centred
 *  - `[AF-06]` ±1 default, +N indicator drives one-step expand,
 *    Show-full-chain warns past 20 nodes
 *  - `[AF-07]` node click → workbench, business click → BTC profile
 *  - `[AF-08]` collapsible legend top-right, sessionStorage-persisted
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import { Skeleton } from '@/components/shared/Skeleton';
import { chargingApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type {
  CascadeChainResponse,
  CascadeEdge,
  CascadeNode,
  DistributionVersionResponse,
} from '@/types/api';
import { VersionSelector } from '@/modules/charging/distribution/versions/VersionSelector';

import {
  BUSINESS_TERMINAL_THRESHOLD,
  buildLayout,
  countVisibleNodes,
  FOCAL_NODE_W,
  MAX_LAYOUT_DEPTH,
  maxDepths,
} from './layout';
import { pickInForceVersionId } from '@/modules/charging/distribution/versions/versionLabels';
import { edgeKey } from './edgeGeometry';
import { useAllocationFlowState } from './useAllocationFlowState';
import { ColumnHeaders } from './ColumnHeaders';
import { EntityNode } from './nodes/EntityNode';
import { FocalEntityNode } from './nodes/FocalEntityNode';
import { SelfRetainedBadge } from './nodes/SelfRetainedBadge';
import { BusinessNode } from './nodes/BusinessNode';
import { CollapsedBusinessNode } from './nodes/CollapsedBusinessNode';
import { CascadeEdge as CascadeEdgeComp } from './edges/CascadeEdge';
import { FlowLegend } from './FlowLegend';
import { FlowTooltip } from './FlowTooltip';
import { ShowFullChainToggle } from './ShowFullChainToggle';

export function AllocationFlowView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entityId = searchParams.get('entity');

  const [data, setData] = useState<CascadeChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Versions list for the top-right selector.
  const [versions, setVersions] = useState<DistributionVersionResponse[]>([]);
  const [versionsLoaded, setVersionsLoaded] = useState(false);

  const { state, dispatch } = useAllocationFlowState(entityId);

  // Load production versions once — independent of entity selection.
  useEffect(() => {
    let cancelled = false;
    chargingApi
      .listDistributionVersions({ include_scenario: false })
      .then((res) => {
        if (cancelled) return;
        setVersions(res.items);
      })
      .catch(() => {
        if (cancelled) return;
        setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setVersionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inForceVersionId = useMemo(
    () => pickInForceVersionId(versions),
    [versions],
  );

  // Cascade fetch — refetches when entity or selected version changes.
  // Extracted into a `useCallback` so the effect can have a clean
  // dependency array (just `fetchCascade`) without the
  // `exhaustive-deps` escape hatch. The `cancelled` flag stays INSIDE
  // the callback and is captured by the inner promise chain, then
  // tripped via the returned cleanup function — preserving the React
  // strict-mode double-mount + rapid-rerender semantics from the
  // previous inline-effect form.
  const fetchCascade = useCallback(() => {
    if (!entityId) {
      setLoading(false);
      setError('Missing entity parameter.');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    chargingApi
      .getCascadeChain(
        entityId,
        state.selectedVersionId !== null
          ? { version_id: state.selectedVersionId }
          : undefined,
      )
      .then((res) => {
        if (!cancelled) {
          setData(res);
          // No `set_version` dispatch here. When `selectedVersionId` is
          // null (initial mount or after reset), the VersionSelector
          // falls back to `data.version.id` via the `??` at its `value`
          // prop, so the UI still shows the resolved version. Dispatching
          // here would change state.selectedVersionId → invalidate this
          // useCallback's identity → re-run the effect → fire a redundant
          // second fetch for the same data. Wave C carry-forward bug
          // (existed since Wave B's AllocationFlowView; pre-existing on
          // main at cb882a5).
        }
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
  }, [entityId, state.selectedVersionId]);

  useEffect(() => {
    const cleanup = fetchCascade();
    return cleanup;
  }, [fetchCascade]);

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

  // For ShowFullChainToggle warning + disabled state.
  const fullChainStats = useMemo(() => {
    if (!data)
      return { fullyExpandedNodeCount: 0, hasDeeperChain: false };
    const md = maxDepths(data);
    const count = countVisibleNodes(
      data,
      MAX_LAYOUT_DEPTH,
      MAX_LAYOUT_DEPTH,
    );
    const hasDeeper =
      md.up > state.expandedDepthUp || md.down > state.expandedDepthDown;
    return { fullyExpandedNodeCount: count, hasDeeperChain: hasDeeper };
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

  // Tooltip: derive from hover state.
  const tooltip = useMemo(() => {
    if (!layout || !data) return null;
    if (state.hoverEdgeKey) {
      const [src, dst] = state.hoverEdgeKey.split('→');
      const e = layout.edges.find(
        (ed) =>
          ed.source_entity_id === src && ed.destination_entity_id === dst,
      );
      if (!e) return null;
      const sp = positionById.get(src);
      const dp = positionById.get(dst);
      if (!sp || !dp) return null;
      const cx = (sp.x + sp.w + dp.x) / 2;
      const cy = (sp.y + sp.h / 2 + dp.y + dp.h / 2) / 2;
      return {
        kind: 'edge' as const,
        edge: e,
        left: cx + 20,
        top: cy - 30,
        version: data.version,
      };
    }
    if (state.hoverNodeId) {
      const pos = positionById.get(state.hoverNodeId);
      if (!pos) return null;
      const node =
        state.hoverNodeId === data.focal.entity_id
          ? data.focal
          : (data.upstream.find(
              (n) => n.entity_id === state.hoverNodeId,
            ) ??
            data.downstream.find(
              (n) => n.entity_id === state.hoverNodeId,
            ));
      if (!node) return null;
      return {
        kind: 'node' as const,
        node,
        left: pos.x + pos.w + 12,
        top: pos.y,
      };
    }
    return null;
  }, [state.hoverEdgeKey, state.hoverNodeId, layout, data, positionById]);

  // Wave C breadcrumb chain. While the focal entity is still loading we
  // omit the middle crumb (would be a flash of the entity-id) and show
  // just the parent + leaf crumbs.
  const breadcrumbItems = useMemo(() => {
    if (data) {
      return [
        { label: 'Workbench', to: '/workbench' },
        {
          label: data.focal.entity_name,
          to: `/workbench?entity=${entityId}`,
        },
        { label: 'Allocation Flow' },
      ];
    }
    return [
      { label: 'Workbench', to: '/workbench' },
      { label: 'Allocation Flow' },
    ];
  }, [data, entityId]);

  return (
    <div className="px-6 py-6 space-y-4">
      <Breadcrumb items={breadcrumbItems} />
      <ModuleHeader
        title="Workbench"
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

          {/* Toolbar: version selector + show-full-chain. */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Distribution version
              </label>
              {versionsLoaded ? (
                <VersionSelector
                  versions={versions}
                  selectedVersionId={state.selectedVersionId ?? data.version.id}
                  inForceVersionId={inForceVersionId}
                  onChange={(id) =>
                    dispatch({ type: 'set_version', id })
                  }
                />
              ) : (
                <Skeleton className="h-9 w-[320px]" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ShowFullChainToggle
                showFullChain={state.showFullChain}
                fullyExpandedNodeCount={fullChainStats.fullyExpandedNodeCount}
                hasDeeperChain={fullChainStats.hasDeeperChain}
                onApply={(value) =>
                  dispatch({ type: 'set_show_full_chain', value })
                }
              />
            </div>
          </div>

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

          {/* Soft-empty labels (Wave C option 2). Rendered as HTML
              above the SVG container so they're not clipped by the
              focal-centred layout's left edge (SIDE_PAD=24) when the
              focal is a root with no upstream column to push it right.
              The full-isolation EmptyState card above still wins when
              ALL three columns are empty; these labels surface the
              single-direction empty case in the toolbar gap. */}
          {(layout.upstream.length === 0 ||
            (layout.downstream.length === 0 && layout.business.length === 0)) &&
            !(
              layout.upstream.length === 0 &&
              layout.downstream.length === 0 &&
              layout.business.length === 0
            ) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {layout.upstream.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No upstream allocations.
                  </p>
                )}
                {layout.downstream.length === 0 &&
                  layout.business.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No downstream allocations.
                    </p>
                  )}
              </div>
            )}

          <Card className="p-0 relative">
            {/* Legend overlay — stays pinned regardless of horizontal scroll. */}
            <div className="absolute top-3 right-3 z-20">
              <FlowLegend
                open={state.legendOpen}
                onToggle={() => dispatch({ type: 'toggle_legend' })}
              />
            </div>

            <div className="overflow-x-auto overflow-y-hidden">
              <div
                className="relative"
                style={{ width: layout.width, height: layout.height }}
              >
                <svg
                  role="img"
                  aria-label="Allocation flow diagram"
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  className="block"
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

                  {/* Edges (rendered first so node bodies sit on top). */}
                  {layout.edges.map((e) => {
                    const src = positionById.get(e.source_entity_id);
                    const dst = positionById.get(e.destination_entity_id);
                    if (!src || !dst) return null;
                    const key = edgeKey(
                      e.source_entity_id,
                      e.destination_entity_id,
                    );
                    return (
                      <CascadeEdgeComp
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
                      hiddenCount={layout.hiddenUpstreamCount.get(
                        p.node.entity_id,
                      )}
                      hiddenDirection="upstream"
                      isHovered={state.hoverNodeId === p.node.entity_id}
                      onHoverChange={(h) =>
                        dispatch({
                          type: 'set_hover_node',
                          id: h ? p.node.entity_id : null,
                        })
                      }
                      onClick={() =>
                        navigate(`/workbench?entity=${p.node.entity_id}`)
                      }
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
                      hiddenCount={layout.hiddenDownstreamCount.get(
                        p.node.entity_id,
                      )}
                      hiddenDirection="downstream"
                      isHovered={state.hoverNodeId === p.node.entity_id}
                      onHoverChange={(h) =>
                        dispatch({
                          type: 'set_hover_node',
                          id: h ? p.node.entity_id : null,
                        })
                      }
                      onClick={() =>
                        navigate(`/workbench?entity=${p.node.entity_id}`)
                      }
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
                    isHovered={
                      state.hoverNodeId === layout.focal.node.entity_id
                    }
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
                        isHovered={
                          state.hoverNodeId === '__collapsed_business__'
                        }
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

                {/* Tooltip lives inside the scroll container so it
                    pans together with the SVG content. */}
                {tooltip && tooltip.kind === 'node' && (
                  <FlowTooltip
                    kind="node"
                    node={tooltip.node}
                    left={tooltip.left}
                    top={tooltip.top}
                  />
                )}
                {tooltip && tooltip.kind === 'edge' && (
                  <FlowTooltip
                    kind="edge"
                    edge={tooltip.edge}
                    version={tooltip.version}
                    left={tooltip.left}
                    top={tooltip.top}
                  />
                )}
              </div>
            </div>
          </Card>

          {/* Footer hint when business count exceeds the visible
              threshold — surfaces the collapsed-pill summary inline. */}
          {data.business_terminals.length > BUSINESS_TERMINAL_THRESHOLD && (
            <p className="text-[11px] text-muted-foreground italic">
              Showing top {BUSINESS_TERMINAL_THRESHOLD} business terminals.
              Click the dashed pill to see the full BTC profile.
            </p>
          )}
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

// Re-export the typed CascadeEdge shape to make it explicit at module
// boundary that we consume it without modifying it.
export type { CascadeEdge, CascadeNode };
