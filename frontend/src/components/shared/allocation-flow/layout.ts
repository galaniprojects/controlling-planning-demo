/**
 * Allocation Flow — pure layout engine.
 *
 * Owns viewport sizing, column X coordinates, Y distribution within
 * columns (sorted by inflow € desc to minimise edge crossings), and
 * BFS depth filtering relative to the focal entity. Pure functions
 * only; no React or DOM dependencies — testable with `node --test`.
 *
 * Decision pointers:
 *  - `[AF-01]` Horizontal left-to-right DAG, focal centred.
 *  - `[AF-06]` Initial render ±1 from focal; expand one level at a time.
 *  - §3.8 column labels UPSTREAM | FOCAL ENTITY | DOWNSTREAM.
 *
 * Sizing is built around the 1280px workbench content viewport (excl.
 * sidebar) — the canvas grows horizontally when more depth columns are
 * unlocked, so the parent applies `overflow-x: auto`.
 */
import type {
  CascadeBusinessTerminal,
  CascadeChainResponse,
  CascadeEdge,
  CascadeNode,
} from '@/types/api';

// === Box dimensions ===
export const NODE_W = 200;
export const NODE_H = 92;
export const FOCAL_NODE_W = 240;
export const FOCAL_NODE_H = 116;
export const BUSINESS_NODE_W = 220;
export const BUSINESS_NODE_H = 48;

// === Spacing ===
export const COL_GAP = 80;
export const ROW_GAP = 24;
export const TOP_PAD = 64; // leaves room for column headers
export const SIDE_PAD = 24;
export const BUSINESS_GAP = 12;

// === Self-retained badge offset relative to focal node bottom ===
export const SELF_RETAINED_OFFSET = 14;

/**
 * Cap to keep "show full chain" sane on pathological seeds. Layout caps
 * the per-side depth to this value so a runaway BFS doesn't crash the
 * page. Real graphs are bounded by `max_allocation_depth` already, but
 * defensive clamps avoid corner-case glitches.
 */
export const MAX_LAYOUT_DEPTH = 12;

/**
 * Threshold for collapsing business terminals into a single overflow
 * pill — matches `[AF-04]`.
 */
export const BUSINESS_TERMINAL_THRESHOLD = 10;

/**
 * Vertical orientation only: target maximum width (px) for the "to
 * business" terminal fan. In vertical mode the terminals would
 * otherwise spread across a single ultra-wide row (~10×BUSINESS_NODE_W),
 * ballooning the canvas far past the viewport and pushing the centred
 * entity chain off-screen to the right. We instead wrap them into a
 * bounded grid whose width stays under this target. Horizontal mode is
 * unaffected — it keeps the original single vertically-stacked column.
 */
export const VERTICAL_BUSINESS_TARGET_WIDTH = 960;

/**
 * Logical column classification for a positioned node.
 *
 * - `kind: 'upstream'` / `'downstream'` carry the BFS depth (1-based —
 *   `depth=1` is the direct neighbour of the focal).
 */
export type NodeColumnKind =
  | { kind: 'upstream'; depth: number }
  | { kind: 'focal' }
  | { kind: 'downstream'; depth: number };

/**
 * Layout orientation. `horizontal` is the original workbench DAG
 * (depth runs L→R, siblings stack on Y). `vertical` swaps the axes so
 * depth runs T→B and siblings stack on X — used by the Run Cost
 * Distributions "Cascade" mode (§10.3). The swap is purely positional:
 * node box dimensions are unchanged, only their x/y placement flips.
 */
export type FlowOrientation = 'horizontal' | 'vertical';

export interface PositionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PositionedEntity extends PositionBox {
  node: CascadeNode;
  column: NodeColumnKind;
}

export interface PositionedBusinessTerminal extends PositionBox {
  kind: 'terminal';
  terminal: CascadeBusinessTerminal;
}

export interface PositionedCollapsedBusiness extends PositionBox {
  kind: 'collapsed';
  hiddenCount: number;
  hiddenAmount: number;
  hiddenPct: number;
}

export type PositionedBusinessItem =
  | PositionedBusinessTerminal
  | PositionedCollapsedBusiness;

export interface FlowLayout {
  width: number;
  height: number;
  focal: PositionedEntity;
  upstream: PositionedEntity[];
  downstream: PositionedEntity[];
  business: PositionedBusinessItem[];
  /** Visible edges between visible nodes (focal-side filtering applied). */
  edges: CascadeEdge[];
  /** Max edge amount in the visible set — drives stroke-width scaling. */
  maxEdgeAmount: number;
  /**
   * For each visible upstream node, how many further-upstream nodes
   * lie beyond the current cap. Drives the inline +N expand pill
   * rendered by `EntityNode`.
   */
  hiddenUpstreamCount: Map<string, number>;
  hiddenDownstreamCount: Map<string, number>;
  /** True when the cascade has any business terminal — drives column omission per §3.2. */
  hasBusiness: boolean;
  /** Self-retained slot just below the focal. */
  selfRetained: { x: number; y: number; w: number; h: number };
}

interface EdgeAdjacency {
  incoming: Map<string, CascadeEdge[]>;
  outgoing: Map<string, CascadeEdge[]>;
}

function indexEdges(edges: readonly CascadeEdge[]): EdgeAdjacency {
  const incoming = new Map<string, CascadeEdge[]>();
  const outgoing = new Map<string, CascadeEdge[]>();
  for (const e of edges) {
    if (!incoming.has(e.destination_entity_id))
      incoming.set(e.destination_entity_id, []);
    incoming.get(e.destination_entity_id)!.push(e);
    if (!outgoing.has(e.source_entity_id))
      outgoing.set(e.source_entity_id, []);
    outgoing.get(e.source_entity_id)!.push(e);
  }
  return { incoming, outgoing };
}

/**
 * BFS from the focal entity in both directions, returning the depth
 * of each upstream and downstream node. `depth=1` is the direct
 * neighbour; nodes unreachable from the focal in the requested
 * direction are absent from the map.
 *
 * Used by the layout to bucket nodes into depth-columns and by the
 * client-side depth filter to drop nodes whose depth exceeds the
 * current `expandedDepthUp` / `expandedDepthDown`.
 */
export function computeDepths(chain: CascadeChainResponse): {
  upstream: Map<string, number>;
  downstream: Map<string, number>;
} {
  const { incoming, outgoing } = indexEdges(chain.edges);
  const focalId = chain.focal.entity_id;

  const upDepth = bfs(focalId, incoming, (e) => e.source_entity_id);
  const downDepth = bfs(focalId, outgoing, (e) => e.destination_entity_id);

  return { upstream: upDepth, downstream: downDepth };
}

function bfs(
  startId: string,
  adjacency: Map<string, CascadeEdge[]>,
  next: (e: CascadeEdge) => string,
): Map<string, number> {
  const depth = new Map<string, number>();
  const visited = new Set<string>([startId]);
  let frontier: Array<{ id: string; d: number }> = [{ id: startId, d: 0 }];
  // BFS guarantees the first time we see a node we have its shortest
  // distance — no need to relax. We cap at MAX_LAYOUT_DEPTH defensively.
  while (frontier.length) {
    const nextFrontier: Array<{ id: string; d: number }> = [];
    for (const { id, d } of frontier) {
      if (d >= MAX_LAYOUT_DEPTH) continue;
      for (const e of adjacency.get(id) ?? []) {
        const n = next(e);
        if (visited.has(n)) continue;
        visited.add(n);
        depth.set(n, d + 1);
        nextFrontier.push({ id: n, d: d + 1 });
      }
    }
    frontier = nextFrontier;
  }
  return depth;
}

/**
 * Compute the full Allocation Flow layout for a cascade response.
 *
 * `expandedDepthUp` / `expandedDepthDown` are the client-side depth
 * caps (defaults to 1 on first render — `[AF-06]`). The cascade
 * response always carries the entire graph, so depth expansion is
 * purely a filter operation — no refetch.
 */
export function buildLayout(
  chain: CascadeChainResponse,
  expandedDepthUp: number,
  expandedDepthDown: number,
  orientation: FlowOrientation = 'horizontal',
): FlowLayout {
  const depths = computeDepths(chain);
  const capUp = Math.min(MAX_LAYOUT_DEPTH, Math.max(1, expandedDepthUp));
  const capDown = Math.min(MAX_LAYOUT_DEPTH, Math.max(1, expandedDepthDown));

  // === Bucket nodes by depth, filter to visible set ===
  const upByDepth = new Map<number, CascadeNode[]>();
  const downByDepth = new Map<number, CascadeNode[]>();
  for (const n of chain.upstream) {
    const d = depths.upstream.get(n.entity_id);
    if (d === undefined || d > capUp) continue;
    if (!upByDepth.has(d)) upByDepth.set(d, []);
    upByDepth.get(d)!.push(n);
  }
  for (const n of chain.downstream) {
    const d = depths.downstream.get(n.entity_id);
    if (d === undefined || d > capDown) continue;
    if (!downByDepth.has(d)) downByDepth.set(d, []);
    downByDepth.get(d)!.push(n);
  }

  // Stable sort within each column: by inflow € desc, then identifier
  // asc as tie-breaker so layout is deterministic across reseeds.
  const sortColumn = (arr: CascadeNode[]) => {
    arr.sort((a, b) => {
      if (b.effective_cost !== a.effective_cost)
        return b.effective_cost - a.effective_cost;
      return a.identifier.localeCompare(b.identifier);
    });
  };
  for (const arr of upByDepth.values()) sortColumn(arr);
  for (const arr of downByDepth.values()) sortColumn(arr);

  // === Depth + sibling axes (orientation-aware) ===
  // Horizontal: depth runs along X (columns L→R), siblings stack on Y.
  // Vertical:   depth runs along Y (rows  T→B),  siblings stack on X.
  // Node boxes keep their w/h; only the placement axes swap, so every
  // downstream consumer (nodes, edges) stays purely positional.
  const isV = orientation === 'vertical';
  // Extent a box consumes along each axis.
  const depthOf = (w: number, h: number) => (isV ? h : w);
  const sibOf = (w: number, h: number) => (isV ? w : h);
  // Map an abstract (depth, sibling) coordinate to absolute x/y.
  const place = (depth: number, sib: number) =>
    isV ? { x: sib, y: depth } : { x: depth, y: sib };

  // Order: farthest upstream → focal → farthest downstream → business.
  const upDepthsAsc = Array.from(upByDepth.keys()).sort((a, b) => a - b);
  // Render farthest-upstream first (top/left), so depth=N is band 0.
  const upDepthsDesc = [...upDepthsAsc].reverse();
  const downDepthsAsc = Array.from(downByDepth.keys()).sort((a, b) => a - b);

  const hasBusiness = chain.business_terminals.length > 0;

  // Business terminal counts + (vertical) grid wrap, computed up-front so
  // the band's depth extent is known before the depth-axis cursor runs.
  const businessVisibleCount = Math.min(
    chain.business_terminals.length,
    BUSINESS_TERMINAL_THRESHOLD,
  );
  const businessOverflow =
    chain.business_terminals.length > BUSINESS_TERMINAL_THRESHOLD;
  // Total rendered business items = visible terminals + optional pill.
  const businessItemCount = businessVisibleCount + (businessOverflow ? 1 : 0);
  // Horizontal keeps a single vertically-stacked column (cols = 1).
  // Vertical wraps into a bounded grid so the canvas width stays near the
  // viewport instead of one ultra-wide row.
  const businessCols = isV
    ? Math.max(
        1,
        Math.min(
          Math.max(1, businessItemCount),
          Math.floor(
            (VERTICAL_BUSINESS_TARGET_WIDTH + BUSINESS_GAP) /
              (BUSINESS_NODE_W + BUSINESS_GAP),
          ),
        ),
      )
    : 1;
  const businessGridRows =
    businessItemCount > 0 ? Math.ceil(businessItemCount / businessCols) : 0;
  // Extent the business band consumes along each axis.
  const businessBandSib = isV
    ? businessCols * BUSINESS_NODE_W + (businessCols - 1) * BUSINESS_GAP
    : businessItemCount * BUSINESS_NODE_H +
      Math.max(0, businessItemCount - 1) * BUSINESS_GAP;
  const businessBandDepth = isV
    ? businessGridRows * BUSINESS_NODE_H +
      Math.max(0, businessGridRows - 1) * BUSINESS_GAP
    : BUSINESS_NODE_W;

  // Padding: the depth axis carries the band sequence; the sibling axis
  // carries the centred stacks. Headers live in the depth-start gutter
  // in horizontal (TOP_PAD top strip); in vertical that gutter is the
  // sibling-start margin instead.
  const depthStart = isV ? TOP_PAD : SIDE_PAD;
  const depthEndPad = isV ? 48 : SIDE_PAD;
  const sibStart = isV ? SIDE_PAD : TOP_PAD;
  const sibEndPad = isV ? SIDE_PAD : 48;

  // Depth-axis coordinate (band start) per column.
  // key: "up-<d>" | "focal" | "down-<d>" | "business"
  const depthPos = new Map<string, number>();
  let cursor = depthStart;
  for (const d of upDepthsDesc) {
    depthPos.set(`up-${d}`, cursor);
    cursor += depthOf(NODE_W, NODE_H) + COL_GAP;
  }
  depthPos.set('focal', cursor);
  cursor += depthOf(FOCAL_NODE_W, FOCAL_NODE_H) + COL_GAP;
  for (const d of downDepthsAsc) {
    depthPos.set(`down-${d}`, cursor);
    cursor += depthOf(NODE_W, NODE_H) + COL_GAP;
  }
  if (hasBusiness) {
    depthPos.set('business', cursor);
    cursor += businessBandDepth + COL_GAP;
  }
  const depthTotal = cursor - COL_GAP + depthEndPad;

  // === Sibling-axis sizing ===
  // Tallest sibling stack across all bands defines the cross-axis span.
  const siblingStack = (count: number, sibExtent: number, gap: number) =>
    count <= 0 ? 0 : count * sibExtent + (count - 1) * gap;

  const entitySib = sibOf(NODE_W, NODE_H);
  const upHeights = upDepthsDesc.map((d) =>
    siblingStack((upByDepth.get(d) ?? []).length, entitySib, ROW_GAP),
  );
  const downHeights = downDepthsAsc.map((d) =>
    siblingStack((downByDepth.get(d) ?? []).length, entitySib, ROW_GAP),
  );

  // The focal's sibling footprint includes the self-retained badge only
  // when the badge stacks along the sibling axis (horizontal). In
  // vertical the badge sits below the focal along the depth axis, so it
  // does not widen the focal band.
  const focalStackHeight =
    sibOf(FOCAL_NODE_W, FOCAL_NODE_H) + (isV ? 0 : SELF_RETAINED_OFFSET + 24);

  const tallestColumn = Math.max(
    focalStackHeight,
    ...upHeights,
    ...downHeights,
    businessBandSib,
  );

  const canvasWidth = isV
    ? sibStart + tallestColumn + sibEndPad
    : Math.max(depthTotal, 1280);
  const canvasHeight = isV ? depthTotal : sibStart + tallestColumn + sibEndPad;

  // Centre each band's stack against the focal's sibling centre.
  const focalCentre = sibStart + tallestColumn / 2;

  const placeColumn = (
    nodes: CascadeNode[],
    depth: number,
    boxW: number,
    boxH: number,
    kindFor: (idx: number, n: CascadeNode) => NodeColumnKind,
  ): PositionedEntity[] => {
    if (nodes.length === 0) return [];
    const sibExtent = sibOf(boxW, boxH);
    const stack = siblingStack(nodes.length, sibExtent, ROW_GAP);
    const startSib = focalCentre - stack / 2;
    return nodes.map((n, i) => ({
      node: n,
      ...place(depth, startSib + i * (sibExtent + ROW_GAP)),
      w: boxW,
      h: boxH,
      column: kindFor(i, n),
    }));
  };

  const upPositioned: PositionedEntity[] = [];
  for (const d of upDepthsDesc) {
    const nodes = upByDepth.get(d) ?? [];
    const depth = depthPos.get(`up-${d}`)!;
    upPositioned.push(
      ...placeColumn(nodes, depth, NODE_W, NODE_H, () => ({
        kind: 'upstream',
        depth: d,
      })),
    );
  }
  const downPositioned: PositionedEntity[] = [];
  for (const d of downDepthsAsc) {
    const nodes = downByDepth.get(d) ?? [];
    const depth = depthPos.get(`down-${d}`)!;
    downPositioned.push(
      ...placeColumn(nodes, depth, NODE_W, NODE_H, () => ({
        kind: 'downstream',
        depth: d,
      })),
    );
  }

  const focalDepth = depthPos.get('focal')!;
  const focalSib = focalCentre - sibOf(FOCAL_NODE_W, FOCAL_NODE_H) / 2;
  const focal: PositionedEntity = {
    node: chain.focal,
    ...place(focalDepth, focalSib),
    w: FOCAL_NODE_W,
    h: FOCAL_NODE_H,
    column: { kind: 'focal' },
  };
  // Self-retained badge sits just past the focal along the depth axis
  // (below it in both orientations, since focal.x/y already encode the
  // swap and the badge keeps the focal's sibling alignment).
  const selfRetained = {
    x: focal.x,
    y: focal.y + FOCAL_NODE_H + SELF_RETAINED_OFFSET,
    w: FOCAL_NODE_W,
    h: 24,
  };

  // === Business terminals ===
  const business: PositionedBusinessItem[] = [];
  if (hasBusiness) {
    const depth = depthPos.get('business')!;
    const sortedTerms = [...chain.business_terminals].sort(
      (a, b) => b.percentage - a.percentage,
    );
    const visibleTerms = sortedTerms.slice(0, BUSINESS_TERMINAL_THRESHOLD);
    const hidden = sortedTerms.slice(BUSINESS_TERMINAL_THRESHOLD);
    const startSib = focalCentre - businessBandSib / 2;
    // Cell placement. Vertical wraps every `businessCols` items into a new
    // depth row (grid); horizontal stays a single column stacked along the
    // sibling axis (byte-equivalent to the original single-column layout).
    const cellOf = (i: number) => {
      if (isV) {
        const col = i % businessCols;
        const row = Math.floor(i / businessCols);
        return place(
          depth + row * (BUSINESS_NODE_H + BUSINESS_GAP),
          startSib + col * (BUSINESS_NODE_W + BUSINESS_GAP),
        );
      }
      return place(depth, startSib + i * (BUSINESS_NODE_H + BUSINESS_GAP));
    };
    visibleTerms.forEach((t, i) => {
      business.push({
        kind: 'terminal',
        terminal: t,
        ...cellOf(i),
        w: BUSINESS_NODE_W,
        h: BUSINESS_NODE_H,
      });
    });
    if (hidden.length > 0) {
      const hiddenAmount = hidden.reduce((s, t) => s + t.amount, 0);
      const hiddenPct = hidden.reduce((s, t) => s + t.percentage, 0);
      business.push({
        kind: 'collapsed',
        hiddenCount: hidden.length,
        hiddenAmount,
        hiddenPct,
        ...cellOf(visibleTerms.length),
        w: BUSINESS_NODE_W,
        h: BUSINESS_NODE_H,
      });
    }
  }

  // === Visible edge filtering + hidden-edge counts ===
  const visibleIds = new Set<string>([chain.focal.entity_id]);
  for (const p of upPositioned) visibleIds.add(p.node.entity_id);
  for (const p of downPositioned) visibleIds.add(p.node.entity_id);

  const visibleEdges: CascadeEdge[] = [];
  let maxEdgeAmount = 0;
  for (const e of chain.edges) {
    if (visibleIds.has(e.source_entity_id) && visibleIds.has(e.destination_entity_id)) {
      visibleEdges.push(e);
      if (e.amount > maxEdgeAmount) maxEdgeAmount = e.amount;
    }
  }

  // Hidden-edge counts on boundary nodes — only at the cap depth.
  const hiddenUp = new Map<string, number>();
  const hiddenDown = new Map<string, number>();
  for (const p of upPositioned) {
    if (p.column.kind !== 'upstream' || p.column.depth !== capUp) continue;
    // Hidden incoming edges of this node (deeper upstream).
    const count = chain.edges.filter(
      (e) => e.destination_entity_id === p.node.entity_id && !visibleIds.has(e.source_entity_id),
    ).length;
    if (count > 0) hiddenUp.set(p.node.entity_id, count);
  }
  for (const p of downPositioned) {
    if (p.column.kind !== 'downstream' || p.column.depth !== capDown) continue;
    const count = chain.edges.filter(
      (e) => e.source_entity_id === p.node.entity_id && !visibleIds.has(e.destination_entity_id),
    ).length;
    if (count > 0) hiddenDown.set(p.node.entity_id, count);
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    focal,
    upstream: upPositioned,
    downstream: downPositioned,
    business,
    edges: visibleEdges,
    maxEdgeAmount,
    hiddenUpstreamCount: hiddenUp,
    hiddenDownstreamCount: hiddenDown,
    hasBusiness,
    selfRetained,
  };
}

/**
 * Count of visible nodes (entities + business terminals) at the
 * supplied depth caps. Used by the "Show full chain" toggle to warn
 * when the expanded view will exceed 20 nodes — `[AF-06]`.
 */
export function countVisibleNodes(
  chain: CascadeChainResponse,
  depthUp: number,
  depthDown: number,
): number {
  const depths = computeDepths(chain);
  let count = 1; // focal
  for (const n of chain.upstream) {
    const d = depths.upstream.get(n.entity_id);
    if (d !== undefined && d <= depthUp) count++;
  }
  for (const n of chain.downstream) {
    const d = depths.downstream.get(n.entity_id);
    if (d !== undefined && d <= depthDown) count++;
  }
  const visibleBusiness = Math.min(
    chain.business_terminals.length,
    BUSINESS_TERMINAL_THRESHOLD,
  );
  count += visibleBusiness;
  if (chain.business_terminals.length > BUSINESS_TERMINAL_THRESHOLD) count++;
  return count;
}

/**
 * Maximum reachable depth on each side — used by `ShowFullChainToggle`
 * to decide whether expansion would actually grow the graph.
 */
export function maxDepths(chain: CascadeChainResponse): {
  up: number;
  down: number;
} {
  const depths = computeDepths(chain);
  let up = 0;
  let down = 0;
  for (const d of depths.upstream.values()) up = Math.max(up, d);
  for (const d of depths.downstream.values()) down = Math.max(down, d);
  return { up, down };
}
