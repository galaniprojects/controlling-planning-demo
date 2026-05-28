/**
 * Pure unit tests for the layout engine.
 *
 * Run with:
 *   npm test
 */
import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TERMINAL_THRESHOLD,
  buildLayout,
  computeDepths,
  countVisibleNodes,
  FOCAL_NODE_W,
  maxDepths,
  NODE_W,
  SIDE_PAD,
} from '../layout.ts';
import type {
  CascadeBusinessTerminal,
  CascadeChainResponse,
  CascadeEdge,
  CascadeNode,
  DistributionVersionResponse,
} from '../../../../types/api.ts';

const FAKE_VERSION: DistributionVersionResponse = {
  id: 1,
  status: 'active',
  active_from: '2026-04-01',
  rationale: 'fixture',
  origin: 'seed',
  copied_from_version_id: null,
  scenario_id: null,
  created_at: '2026-04-01T00:00:00Z',
  created_by_person_id: null,
  activated_at: '2026-04-01T00:00:00Z',
  edge_count: 0,
};

function node(
  id: string,
  identifier: string,
  effective_cost: number,
  own_cost = effective_cost,
): CascadeNode {
  return {
    entity_id: id,
    entity_name: identifier.toUpperCase(),
    entity_type: 'InternalService',
    identifier,
    own_cost,
    effective_cost,
    to_business_pct: 0,
    self_retained_pct: 100,
  };
}

function edge(src: string, dst: string, pct: number, amount: number): CascadeEdge {
  return {
    source_entity_id: src,
    destination_entity_id: dst,
    percentage: pct,
    amount,
    chain_depth: null,
    rationale: null,
  };
}

function chain(opts: {
  focal: CascadeNode;
  upstream?: CascadeNode[];
  downstream?: CascadeNode[];
  edges?: CascadeEdge[];
  business?: CascadeBusinessTerminal[];
  max_allocation_depth?: number;
}): CascadeChainResponse {
  return {
    focal: opts.focal,
    upstream: opts.upstream ?? [],
    downstream: opts.downstream ?? [],
    edges: opts.edges ?? [],
    business_terminals: opts.business ?? [],
    version: FAKE_VERSION,
    evaluated_date: '2026-04-15',
    max_allocation_depth: opts.max_allocation_depth ?? 5,
  };
}

describe('computeDepths', () => {
  it('assigns depth=1 to direct neighbours of focal', () => {
    const focal = node('f', 'FOCAL', 1000);
    const up1 = node('u1', 'U1', 500);
    const down1 = node('d1', 'D1', 300);
    const c = chain({
      focal,
      upstream: [up1],
      downstream: [down1],
      edges: [edge('u1', 'f', 50, 500), edge('f', 'd1', 30, 300)],
    });
    const depths = computeDepths(c);
    expect(depths.upstream.get('u1')).toBe(1);
    expect(depths.downstream.get('d1')).toBe(1);
  });

  it('climbs upstream multiple levels via BFS', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500), node('u2', 'U2', 200)],
      edges: [edge('u1', 'f', 50, 500), edge('u2', 'u1', 40, 200)],
    });
    const d = computeDepths(c);
    expect(d.upstream.get('u1')).toBe(1);
    expect(d.upstream.get('u2')).toBe(2);
  });

  it('extends downstream multiple levels via BFS', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      downstream: [node('d1', 'D1', 500), node('d2', 'D2', 200)],
      edges: [edge('f', 'd1', 50, 500), edge('d1', 'd2', 40, 200)],
    });
    const d = computeDepths(c);
    expect(d.downstream.get('d1')).toBe(1);
    expect(d.downstream.get('d2')).toBe(2);
  });

  it('uses shortest distance for diamond shapes', () => {
    // r → a, r → b, a → c, b → c. From focal=r, c is depth 2 via both paths.
    const c = chain({
      focal: node('r', 'R', 1000),
      downstream: [
        node('a', 'A', 400),
        node('b', 'B', 600),
        node('c', 'C', 100),
      ],
      edges: [
        edge('r', 'a', 40, 400),
        edge('r', 'b', 60, 600),
        edge('a', 'c', 25, 100),
        edge('b', 'c', 16, 96),
      ],
    });
    const d = computeDepths(c);
    expect(d.downstream.get('a')).toBe(1);
    expect(d.downstream.get('b')).toBe(1);
    expect(d.downstream.get('c')).toBe(2);
  });
});

describe('buildLayout', () => {
  it('diamond at expandedDepth=2 preserves BOTH incoming edges into the shared node', () => {
    // Regression for S-7 from the Wave B review: the previous
    // `computeDepths: diamond` test only asserted shortest distance —
    // it didn't confirm that when the shared node `c` is visible, BOTH
    // edges (a→c, b→c) get included in `layout.edges`. A naive
    // "first-path wins" filter could drop one without the test noticing.
    const c = chain({
      focal: node('r', 'R', 1000),
      downstream: [
        node('a', 'A', 400),
        node('b', 'B', 600),
        node('c', 'C', 100),
      ],
      edges: [
        edge('r', 'a', 40, 400),
        edge('r', 'b', 60, 600),
        edge('a', 'c', 25, 100),
        edge('b', 'c', 16, 96),
      ],
    });
    // expand downstream to 2 so `c` is in the visible set
    const layout = buildLayout(c, 1, 2);
    const incomingToC = layout.edges.filter((e) => e.destination_entity_id === 'c');
    expect(incomingToC.length).toBe(2);
    const sources = incomingToC.map((e) => e.source_entity_id).sort();
    expect(sources).toEqual(['a', 'b']);
  });

  it('±1 default places focal and direct neighbours only', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500), node('u2', 'U2', 200)],
      downstream: [node('d1', 'D1', 300)],
      edges: [
        edge('u1', 'f', 50, 500),
        edge('u2', 'u1', 40, 200),
        edge('f', 'd1', 30, 300),
      ],
    });
    const layout = buildLayout(c, 1, 1);
    expect(layout.upstream.length).toBe(1);
    expect(layout.upstream[0]?.node.entity_id).toBe('u1');
    expect(layout.downstream.length).toBe(1);
    expect(layout.downstream[0]?.node.entity_id).toBe('d1');
    // Hidden +1 indicator on u1 (u2 lurks one level further up).
    expect(layout.hiddenUpstreamCount.get('u1')).toBe(1);
  });

  it('depth-2 expansion reveals deeper neighbours', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500), node('u2', 'U2', 200)],
      edges: [edge('u1', 'f', 50, 500), edge('u2', 'u1', 40, 200)],
    });
    const layout = buildLayout(c, 2, 1);
    expect(layout.upstream.length).toBe(2);
    expect(layout.hiddenUpstreamCount.size).toBe(0);
  });

  it('sorts nodes by inflow € desc within a column', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      downstream: [
        node('d_small', 'B', 100),
        node('d_big', 'A', 800),
        node('d_mid', 'C', 400),
      ],
      edges: [
        edge('f', 'd_small', 10, 100),
        edge('f', 'd_big', 80, 800),
        edge('f', 'd_mid', 40, 400),
      ],
    });
    const layout = buildLayout(c, 1, 1);
    // First in column = largest inflow.
    expect(layout.downstream[0]?.node.entity_id).toBe('d_big');
    expect(layout.downstream[1]?.node.entity_id).toBe('d_mid');
    expect(layout.downstream[2]?.node.entity_id).toBe('d_small');
  });

  it('drops edges to hidden nodes (visible edges only)', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500), node('u2', 'U2', 200)],
      edges: [edge('u1', 'f', 50, 500), edge('u2', 'u1', 40, 200)],
    });
    const layout = buildLayout(c, 1, 1);
    expect(layout.edges.length).toBe(1);
    expect(layout.edges[0]?.source_entity_id).toBe('u1');
  });

  it('tracks the largest visible edge as maxEdgeAmount', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      downstream: [node('d1', 'D1', 800), node('d2', 'D2', 100)],
      edges: [edge('f', 'd1', 80, 800), edge('f', 'd2', 10, 100)],
    });
    const layout = buildLayout(c, 1, 1);
    expect(layout.maxEdgeAmount).toBe(800);
  });

  it('omits the business column when there are no terminals', () => {
    const c = chain({ focal: node('f', 'F', 1000) });
    const layout = buildLayout(c, 1, 1);
    expect(layout.hasBusiness).toBe(false);
    expect(layout.business.length).toBe(0);
  });

  it('collapses business terminals when count > threshold', () => {
    const terms: CascadeBusinessTerminal[] = [];
    for (let i = 0; i < BUSINESS_TERMINAL_THRESHOLD + 5; i++) {
      terms.push({
        charging_location_id: `cl-${i}`,
        code: `CL${i}`,
        name: `Loc ${i}`,
        percentage: 100 - i,
        amount: (100 - i) * 10,
      });
    }
    const c = chain({ focal: node('f', 'F', 1000), business: terms });
    const layout = buildLayout(c, 1, 1);
    // 10 individual + 1 collapsed pill
    expect(layout.business.length).toBe(BUSINESS_TERMINAL_THRESHOLD + 1);
    const collapsed = layout.business[layout.business.length - 1];
    expect(collapsed?.kind).toBe('collapsed');
    if (collapsed?.kind === 'collapsed') {
      expect(collapsed.hiddenCount).toBe(5);
    }
  });

  it('shifts focal x right by exactly one upstream column', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500)],
      edges: [edge('u1', 'f', 50, 500)],
    });
    const layout = buildLayout(c, 1, 1);
    expect(layout.upstream[0]?.x).toBe(SIDE_PAD);
    // focal column = SIDE_PAD + NODE_W + COL_GAP — strictly to the right of upstream.
    expect((layout.focal.x ?? 0) > (layout.upstream[0]?.x ?? 0) + NODE_W).toBe(true);
    expect(layout.focal.w).toBe(FOCAL_NODE_W);
  });
});

describe('countVisibleNodes', () => {
  it('includes focal + neighbours + business pills', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500)],
      downstream: [node('d1', 'D1', 300)],
      edges: [edge('u1', 'f', 50, 500), edge('f', 'd1', 30, 300)],
      business: [
        {
          charging_location_id: 'cl-1',
          code: 'CL1',
          name: 'L1',
          percentage: 50,
          amount: 500,
        },
      ],
    });
    // focal(1) + up(1) + down(1) + business(1) = 4
    expect(countVisibleNodes(c, 1, 1)).toBe(4);
  });
});

describe('maxDepths', () => {
  it('returns 0 for a focal with no neighbours', () => {
    const c = chain({ focal: node('f', 'F', 1000) });
    expect(maxDepths(c)).toEqual({ up: 0, down: 0 });
  });

  it('returns the deepest BFS distance on each side', () => {
    const c = chain({
      focal: node('f', 'F', 1000),
      upstream: [node('u1', 'U1', 500), node('u2', 'U2', 200)],
      downstream: [
        node('d1', 'D1', 300),
        node('d2', 'D2', 150),
        node('d3', 'D3', 50),
      ],
      edges: [
        edge('u1', 'f', 50, 500),
        edge('u2', 'u1', 40, 200),
        edge('f', 'd1', 30, 300),
        edge('d1', 'd2', 50, 150),
        edge('d2', 'd3', 33, 50),
      ],
    });
    expect(maxDepths(c)).toEqual({ up: 2, down: 3 });
  });
});
