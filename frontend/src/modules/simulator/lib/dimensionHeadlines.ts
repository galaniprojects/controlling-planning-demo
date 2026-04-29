/**
 * Headline-string derivation per impact dimension. Centralised so the
 * impact strip and the L1 portfolio compare row use exactly the same
 * formatting.
 *
 * All headlines follow CLAUDE.md: arrows + +/- prefixes for direction,
 * not colour. European number formatting via shared `formatters.ts`.
 */

import { formatCurrency, formatCurrencyDelta } from '@/lib/formatters';
import type {
  BacklogRankingDimensionData,
  CapacityDimensionData,
  ChangeSummaryDimensionData,
  CostAllocationDimensionData,
  FinancialDimensionData,
  ImpactDashboardDimensions,
  InvestmentMixDimensionData,
  OutsourcingDimensionData,
  PeopleDimensionData,
  RunningCostDimensionData,
  DimensionKey,
} from './impactTypes';

const ARROW_UP = '▲';
const ARROW_DOWN = '▼';
const ARROW_FLAT = '·';

function arrowFor(delta: number): string {
  if (delta > 0) return ARROW_UP;
  if (delta < 0) return ARROW_DOWN;
  return ARROW_FLAT;
}

/** Format a budget delta as e.g. "-€1,2M ▼" or "+€450K ▲". */
export function formatDeltaWithArrow(delta: number): string {
  if (delta === 0) return `±€0 ${ARROW_FLAT}`;
  return `${formatCurrencyDelta(delta)} ${arrowFor(delta)}`;
}

/** Format a percentage delta as "+5,2%" / "-2,8%" / "±0%". */
export function formatPctDelta(pct: number): string {
  if (pct === 0) return '±0%';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1).replace('.', ',')}%`;
}

// ---------------------------------------------------------------------------
// Per-dimension headline derivation
// ---------------------------------------------------------------------------

export function financialHeadline(d: FinancialDimensionData | undefined): string {
  if (!d) return '—';
  const delta = d.total_delta;
  const anchor = d.total_anchor ?? d.total_original;
  const pct = anchor && anchor !== 0 ? (delta / anchor) * 100 : 0;
  if (delta === 0) return `${formatCurrency(d.total_adjusted)} (no change)`;
  return `${formatDeltaWithArrow(delta)} ${formatPctDelta(pct)}`;
}

export function backlogRankingHeadline(
  d: BacklogRankingDimensionData | undefined,
): string {
  if (!d) return '—';
  if (d.projects_affected === 0) return 'No ranking shifts';
  const removed = d.projects_removed_count;
  if (removed > 0) {
    return `${d.projects_affected} shifted, ${removed} removed`;
  }
  return `${d.projects_affected} project${d.projects_affected === 1 ? '' : 's'} shifted`;
}

export function capacityHeadline(d: CapacityDimensionData | undefined): string {
  if (!d) return '—';
  if (d.over_100_count > 0) {
    return `${d.over_100_count} CC${d.over_100_count === 1 ? '' : 's'} >100%`;
  }
  if (!d.cost_centers.length) return 'No capacity changes';
  return 'All within capacity';
}

export function peopleHeadline(d: PeopleDimensionData | undefined): string {
  if (!d) return '—';
  if (d.redacted) return 'Tier 3 — restricted';
  const count = d.action_count ?? 0;
  if (count === 0) return 'No people changes';
  return `${count} Tier 3 action${count === 1 ? '' : 's'}`;
}

export function outsourcingHeadline(
  d: OutsourcingDimensionData | undefined,
): string {
  if (!d) return '—';
  return `Int ${d.internal_pct.toFixed(0)}% / Ext ${d.external_pct.toFixed(0)}%`;
}

export function investmentMixHeadline(
  d: InvestmentMixDimensionData | undefined,
): string {
  if (!d) return '—';
  if (!d.items.length) return 'No mix changes';
  const top = d.items[0];
  return `${d.items.length} node${d.items.length === 1 ? '' : 's'} · top: ${top.node_name}`;
}

export function runningCostHeadline(
  d: RunningCostDimensionData | undefined,
): string {
  if (!d) return '—';
  const overall = d.time_frame_breakdown?.find((b) => b.label === 'Overall');
  if (!overall) return 'No long-term breakdown';
  return formatDeltaWithArrow(overall.delta);
}

export function costAllocationHeadline(
  d: CostAllocationDimensionData | undefined,
): string {
  if (!d) return '—';
  if (d.error) return 'Calculation unavailable';
  if (d.touched_entity_count === 0) return 'No allocation changes';
  return `${d.touched_entity_count} entit${d.touched_entity_count === 1 ? 'y' : 'ies'} · ${formatDeltaWithArrow(d.totals.delta)}`;
}

export function changeSummaryHeadline(
  d: ChangeSummaryDimensionData | undefined,
): string {
  if (!d) return '—';
  if (d.total_actions === 0) return 'No changes';
  return `${d.total_actions} change${d.total_actions === 1 ? '' : 's'}`;
}

/**
 * Resolve the headline string for a given dimension key. Used by the strip
 * + L1 compare row.
 */
export function headlineForDimension(
  key: DimensionKey,
  dims: ImpactDashboardDimensions,
): string {
  switch (key) {
    case 'financial':
      return financialHeadline(dims.financial);
    case 'backlog_ranking':
      return backlogRankingHeadline(dims.backlog_ranking);
    case 'capacity':
      return capacityHeadline(dims.capacity);
    case 'people':
      return peopleHeadline(dims.people);
    case 'outsourcing_ratio':
      return outsourcingHeadline(dims.outsourcing_ratio);
    case 'investment_mix':
      return investmentMixHeadline(dims.investment_mix);
    case 'running_cost':
      return runningCostHeadline(dims.running_cost);
    case 'cost_allocation':
      return costAllocationHeadline(dims.cost_allocation);
    case 'change_summary':
      return changeSummaryHeadline(dims.change_summary);
    default:
      return '—';
  }
}
