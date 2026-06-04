import { describe, it, expect } from 'vitest';
import { formatHeadlineImpact } from './ScenarioRow';

/**
 * F1 — the manager "Headline Impact" column must render a compact summary for
 * every `headline_impact` JSON shape the backend emits, not just the financial
 * one (which previously dumped raw JSON for BTC / staffing scenarios).
 */
describe('formatHeadlineImpact', () => {
  it('returns an em dash for null', () => {
    expect(formatHeadlineImpact(null)).toBe('—');
  });

  it('formats the financial-delta shape with European currency + action count', () => {
    // Seed scenario 2: "Budget Pressure: 15% Reduction".
    const raw =
      '{"total_budget_delta": -58500, "action_count": 3, "projects_affected": 3}';
    expect(formatHeadlineImpact(raw)).toBe('-€59K (3 actions)');
  });

  it('singularises the action label for a single action', () => {
    expect(
      formatHeadlineImpact('{"total_budget_delta": 12000, "action_count": 1}'),
    ).toBe('+€12K (1 action)');
  });

  it('formats the BTC percentage-shift shape', () => {
    // Seed scenario 1: "MDH BTC Rebalance — DE/PL/CZ".
    const raw =
      '{"total_btc_pct_shift": 10, "affected_locations": 3, "action_count": 1}';
    expect(formatHeadlineImpact(raw)).toBe('BTC shift 10pp · 3 locations (1 action)');
  });

  it('formats the staffing / capacity-mix shape', () => {
    // Seed scenario 3: "MDH Staffing Mix — MUC/APD".
    const raw =
      '{"total_capacity_shift_fte": 0.0, "senior_to_mid_swap_pct": 40, "action_count": 1}';
    expect(formatHeadlineImpact(raw)).toBe('40% senior→mid (1 action)');
  });

  it('formats the budget-neutral schedule-shift variant', () => {
    // Seed scenario 4: "Predictive Maintenance — Defer 3 Months".
    const raw =
      '{"total_budget_delta": 0, "schedule_shift_months": 3, "action_count": 1, "projects_affected": 1}';
    expect(formatHeadlineImpact(raw)).toBe('Schedule +3 mo (1 action)');
  });

  it('returns a non-JSON string verbatim', () => {
    expect(formatHeadlineImpact('Pending recalculation')).toBe(
      'Pending recalculation',
    );
  });

  it('falls back to the raw string for an unrecognised JSON shape', () => {
    expect(formatHeadlineImpact('{"some_other_metric": 5}')).toBe(
      '{"some_other_metric": 5}',
    );
  });
});
