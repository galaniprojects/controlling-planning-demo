/**
 * Client-side Tech Navigator scoring math.
 *
 * Mirrors backend services/tech_navigator.py exactly so the dedicated Admin
 * scoring page can recompute every project's complexity / value_creation /
 * composite / tshirt against the live (unsaved) weights without an API
 * round-trip per slider drag. Also used by TechNavigatorRubric on the
 * Backlog detail page.
 *
 * Single source of truth: any future change to the scoring formula updates
 * BOTH the backend and this file.
 */

import type {
  TechNavigatorProfile,
  TechNavigatorWeights,
} from '@/types/techNavigator';

export type TshirtSizeLetter = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface SubCriteriaInputs {
  tn_standardization: number | null;
  tn_usage: number | null;
  tn_maintenance: number | null;
  tn_financial_benefit: number | null;
  tn_payback: number | null;
  tn_competitive_advantage: number | null;
}

export interface ProjectScoreInputs extends SubCriteriaInputs {
  total_budget: number | null;
}

export interface ProjectScores {
  complexity_score: number | null;
  value_creation_score: number | null;
  composite_score: number | null;
  tshirt_size: TshirtSizeLetter | null;
}

/**
 * Weighted average with two-decimal rounding.
 *
 * Returns null if any value is null/undefined or all weights are zero.
 * Mirrors backend `_weighted_average` in services/tech_navigator.py:97-109.
 */
export function weightedAverage(
  values: Array<number | null>,
  weights: number[],
): number | null {
  if (values.some((v) => v === null || v === undefined)) return null;
  const totalWeight = weights.reduce<number>((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;
  const weighted = values.reduce<number>(
    (s, v, i) => s + (v as number) * weights[i],
    0,
  );
  return Math.round((weighted / totalWeight) * 100) / 100;
}

export function computeComplexity(
  inputs: SubCriteriaInputs,
  weights: TechNavigatorWeights,
): number | null {
  return weightedAverage(
    [inputs.tn_standardization, inputs.tn_usage, inputs.tn_maintenance],
    [
      weights.complexity.standardization,
      weights.complexity.usage,
      weights.complexity.maintenance,
    ],
  );
}

export function computeValueCreation(
  inputs: SubCriteriaInputs,
  weights: TechNavigatorWeights,
): number | null {
  return weightedAverage(
    [
      inputs.tn_financial_benefit,
      inputs.tn_payback,
      inputs.tn_competitive_advantage,
    ],
    [
      weights.value_creation.financial,
      weights.value_creation.payback,
      weights.value_creation.competitive,
    ],
  );
}

export function computeComposite(
  complexity: number | null,
  valueCreation: number | null,
  weights: TechNavigatorWeights,
): number | null {
  if (complexity === null || valueCreation === null) return null;
  const wV = weights.ranking.value;
  const wC = weights.ranking.complexity;
  const total = wV + wC;
  if (total <= 0) return null;
  return (
    Math.round(((valueCreation * wV + complexity * wC) / total) * 100) / 100
  );
}

export function deriveTshirt(
  totalBudget: number | null,
  weights: TechNavigatorWeights,
): TshirtSizeLetter | null {
  if (totalBudget === null || totalBudget === undefined) return null;
  const t = weights.tshirt;
  if (totalBudget <= t.xs_max) return 'XS';
  if (totalBudget <= t.s_max) return 'S';
  if (totalBudget <= t.m_max) return 'M';
  if (totalBudget <= t.l_max) return 'L';
  return 'XL';
}

/**
 * One-stop: compute all four denormalized fields for a project given its
 * raw sub-criteria + budget + active weights.
 */
export function computeProjectScores(
  inputs: ProjectScoreInputs,
  weights: TechNavigatorWeights,
): ProjectScores {
  const complexity_score = computeComplexity(inputs, weights);
  const value_creation_score = computeValueCreation(inputs, weights);
  const composite_score = computeComposite(
    complexity_score,
    value_creation_score,
    weights,
  );
  const tshirt_size = deriveTshirt(inputs.total_budget, weights);
  return {
    complexity_score,
    value_creation_score,
    composite_score,
    tshirt_size,
  };
}

/**
 * Compute the composite score at the should-be cutoff rank.
 *
 * Mirrors backend `services/ranking.compute_ranked_backlog` exactly:
 *
 *   1. Walk pool excludes anything `competes_in_ranking === false`
 *      (Type 3 pre-funded projects and operate-stage projects).
 *   2. Sort by composite_score DESC, then apply each configured tiebreaker
 *      in order (e.g. `doi:asc`, `total_budget:desc`), then `id` ASC as a
 *      final stable tiebreaker so ties resolve identically every call.
 *   3. Cumulative-sum `total_budget` along the sort; the first project
 *      whose cumulative exceeds `contestableEnvelope` is the cutoff.
 *   4. Returns that project's composite score, or null if no project
 *      crosses the envelope (every project fits).
 *
 * `contestableEnvelope` is NOT `total_available_budget`; it's
 *   total_available − type3_pre_funded − hyper_maintenance_committed
 * (computed server-side and shipped in the API payload).
 */
export interface ProjectWalkRow {
  id: string;
  composite_score: number | null;
  total_budget: number | null;
  doi: number | null;
  competes_in_ranking: boolean;
}

export type TiebreakerField = 'composite_score' | 'doi' | 'total_budget';
export type TiebreakerDir = 'asc' | 'desc';
export type Tiebreaker = [TiebreakerField | string, TiebreakerDir | string];

/** Read a tiebreaker field from a row, preserving null. The comparator
 * needs to distinguish null (sentinel: pushes to bottom) from 0 (a real
 * value that participates in the order). Mirrors backend
 * `services/ranking.py::_project_sort_key` (line 275-280), which uses
 * `_MISSING_ASC = +inf` for missing values in both asc and desc
 * directions. (Distinct from the budget-walk helper
 * `_project_walk_budget` which treats null total_budget as 0.0 — that's
 * a different code path.) */
function readField(row: ProjectWalkRow, field: string): number | null {
  switch (field) {
    case 'composite_score':
      return row.composite_score;
    case 'doi':
      return row.doi;
    case 'total_budget':
      return row.total_budget;
    default:
      return null;
  }
}

/** Compare two field values for a given direction, treating null as a
 * sentinel that sinks to the bottom regardless of direction (matches
 * ranking.py:_project_sort_key). Returns 0 on equality so the caller
 * falls through to the next tiebreaker. */
function compareField(
  a: number | null,
  b: number | null,
  dir: string,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a sinks to bottom
  if (b === null) return -1; // b sinks to bottom
  if (a === b) return 0;
  return dir === 'asc' ? a - b : b - a;
}

export function computeCutoffComposite(
  scored: ProjectWalkRow[],
  contestableEnvelope: number,
  tiebreakers: Tiebreaker[] = [],
): number | null {
  const competing = scored.filter(
    (p) =>
      p.competes_in_ranking &&
      p.composite_score !== null &&
      p.total_budget !== null,
  );

  const ranked = competing.slice().sort((a, b) => {
    // Primary axis is always composite_score:desc (matches backend).
    const compDiff = (b.composite_score as number) - (a.composite_score as number);
    if (compDiff !== 0) return compDiff;
    for (const [field, dir] of tiebreakers) {
      // Skip composite_score in the tiebreaker list — it's the primary axis.
      if (field === 'composite_score') continue;
      const diff = compareField(readField(a, field), readField(b, field), dir);
      if (diff !== 0) return diff;
    }
    // Final stable tiebreaker: project id ASC (matches Python's sort stability
    // after .all() ordered by Project.id in the bulk query path).
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let cum = 0;
  for (const p of ranked) {
    cum += p.total_budget as number;
    if (cum > contestableEnvelope) {
      return p.composite_score;
    }
  }
  return null;
}

/**
 * Solve for two endpoints of the iso-composite line `composite = cutoff`
 * inside the 1..5 quadrant of the Tech Navigator chart, given the composite
 * mixer weights.
 *
 * Line: `cutoff = (V·wV + X·wC) / (wV + wC)`
 * Rearranged for X (complexity, Y-axis): `X = (cutoff·(wV+wC) - V·wV) / wC`.
 *
 * Tries V=1 and V=5 first; clamps endpoints to the 1..5 box, swapping with
 * the inverse axis-solve when needed so the segment fits inside the chart.
 *
 * Returns null when the line doesn't intersect the visible region (e.g.
 * degenerate weights or cutoff far outside 1..5).
 */
export interface IsoLineSegment {
  v1: number;
  c1: number;
  v2: number;
  c2: number;
}

export function isoCompositeEndpoints(
  cutoff: number,
  wV: number,
  wC: number,
): IsoLineSegment | null {
  if (wV <= 0 && wC <= 0) return null;
  const sum = wV + wC;
  if (sum <= 0) return null;

  // Horizontal line case: wV == 0 -> composite = X. Iso line is X = cutoff.
  if (wV === 0) {
    if (cutoff < 1 || cutoff > 5) return null;
    return { v1: 1, c1: cutoff, v2: 5, c2: cutoff };
  }
  // Vertical line case: wC == 0 -> composite = V. Iso line is V = cutoff.
  if (wC === 0) {
    if (cutoff < 1 || cutoff > 5) return null;
    return { v1: cutoff, c1: 1, v2: cutoff, c2: 5 };
  }

  const xAt = (v: number) => (cutoff * sum - v * wV) / wC;
  const vAt = (c: number) => (cutoff * sum - c * wC) / wV;

  const candidates: Array<[number, number]> = [
    [1, xAt(1)],
    [5, xAt(5)],
    [vAt(1), 1],
    [vAt(5), 5],
  ];
  const inside = candidates.filter(
    ([v, c]) => v >= 1 && v <= 5 && c >= 1 && c <= 5,
  );
  if (inside.length < 2) return null;

  // Deduplicate near-equal endpoints (e.g. line passes through a corner).
  const unique = inside.filter((p, i, arr) => {
    return !arr
      .slice(0, i)
      .some(([v, c]) => Math.abs(v - p[0]) < 1e-6 && Math.abs(c - p[1]) < 1e-6);
  });
  if (unique.length < 2) return null;

  const [a, b] = unique;
  return { v1: a[0], c1: a[1], v2: b[0], c2: b[1] };
}

/**
 * Backwards-compatible aliases for the existing TechNavigatorRubric callers.
 * Re-export the lightweight forms so the rubric continues to work after the
 * refactor without changes to its call sites.
 */
export function recomputeComplexityFromProfile(
  profile: TechNavigatorProfile,
  weights: TechNavigatorWeights,
): number | null {
  return computeComplexity(profile, weights);
}

export function recomputeValueCreationFromProfile(
  profile: TechNavigatorProfile,
  weights: TechNavigatorWeights,
): number | null {
  return computeValueCreation(profile, weights);
}

export function recomputeCompositeFromAxes(
  complexity: number | null,
  value: number | null,
  weights: TechNavigatorWeights,
): number | null {
  return computeComposite(complexity, value, weights);
}
