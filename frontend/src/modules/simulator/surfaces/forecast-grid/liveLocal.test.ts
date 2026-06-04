import { describe, it, expect } from 'vitest';
import type {
  ScenarioGridResponse,
  ScenarioGridCell,
} from '../../api/scenariosApi';
import {
  workingEditKey,
  type WorkingCellEdit,
  type WorkingEdits,
} from './forecastGridAdapter';
import {
  computeDeltaVsAnchor,
  computeLineTotals,
  computeProjectBudget,
} from './liveLocal';

function cell(over: Partial<ScenarioGridCell>): ScenarioGridCell {
  return {
    month: '2026-05',
    display_value: 0,
    amount_eur: 0,
    anchor_value: 0,
    anchor_amount_eur: 0,
    field: 'hours',
    can_edit: true,
    is_changed: false,
    has_overlay: false,
    is_empty: false,
    ...over,
  };
}

function resp(): ScenarioGridResponse {
  return {
    scenario_id: 1,
    project_id: 'proj-x',
    start_month: '2026-05',
    end_month: '2026-06',
    open_month: '2026-04',
    columns: [
      { key: '2026-05', cell_type: 'monthly' },
      { key: '2026-06', cell_type: 'monthly' },
    ],
    rows: [
      {
        line_key: 'internal:dev',
        category: 'internal',
        kind: 'internal_role',
        sub_category_name: 'Dev',
        location_name: 'Munich',
        hourly_rate: 100,
        // Rate-consistent: stored € (amount_eur / anchor_amount_eur) == 80 × 100.
        cells: [
          cell({ month: '2026-05', display_value: 80, amount_eur: 8000, anchor_value: 80, anchor_amount_eur: 8000, field: 'hours' }),
          cell({ month: '2026-06', display_value: 80, amount_eur: 8000, anchor_value: 80, anchor_amount_eur: 8000, field: 'hours' }),
        ],
      },
      {
        line_key: 'external:license',
        category: 'external',
        kind: 'external_cost',
        sub_category_name: 'License',
        hourly_rate: null,
        cells: [
          cell({ month: '2026-05', display_value: 2000, amount_eur: 2000, anchor_value: 2000, anchor_amount_eur: 2000, field: 'amount_eur' }),
          cell({ month: '2026-06', display_value: 2000, amount_eur: 2000, anchor_value: 2000, anchor_amount_eur: 2000, field: 'amount_eur' }),
        ],
      },
    ],
  };
}

function mkEdit(over: Partial<WorkingCellEdit>): WorkingCellEdit {
  return {
    category: 'internal',
    lineKey: 'internal:dev',
    month: '2026-05',
    field: 'hours',
    anchorValue: 80,
    newValue: 120,
    hourlyRate: 100,
    pending: true,
    ...over,
  };
}

describe('computeLineTotals', () => {
  it('internal € = Σ(hours) × rate, external € = Σ(€), at anchor', () => {
    const totals = computeLineTotals(resp(), new Map());
    const internal = totals.find((t) => t.lineKey === 'internal:dev')!;
    const external = totals.find((t) => t.lineKey === 'external:license')!;
    // internal: (80 + 80) hours × 100 = 16000
    expect(internal.eur).toBe(16000);
    expect(internal.anchorEur).toBe(16000);
    // external: 2000 + 2000 = 4000
    expect(external.eur).toBe(4000);
    expect(external.anchorEur).toBe(4000);
  });

  it('threads location_name through so same-role/multi-location lines disambiguate (F2)', () => {
    const totals = computeLineTotals(resp(), new Map());
    const internal = totals.find((t) => t.lineKey === 'internal:dev')!;
    const external = totals.find((t) => t.lineKey === 'external:license')!;
    expect(internal.locationName).toBe('Munich');
    // External lines have no workforce location → null, not undefined.
    expect(external.locationName).toBeNull();
  });

  it('applies pending working edits to the live total (not the anchor)', () => {
    const we: WorkingEdits = new Map();
    we.set(workingEditKey('internal', 'internal:dev', '2026-05'), mkEdit({ newValue: 120 }));
    const totals = computeLineTotals(resp(), we);
    const internal = totals.find((t) => t.lineKey === 'internal:dev')!;
    // live: (120 + 80) × 100 = 20000; anchor stays 16000
    expect(internal.eur).toBe(20000);
    expect(internal.anchorEur).toBe(16000);
  });

  it('external working edit folds € directly', () => {
    const we: WorkingEdits = new Map();
    we.set(
      workingEditKey('external', 'external:license', '2026-05'),
      mkEdit({
        category: 'external',
        lineKey: 'external:license',
        field: 'amount_eur',
        anchorValue: 2000,
        newValue: 3500,
        hourlyRate: null,
      }),
    );
    const totals = computeLineTotals(resp(), we);
    const external = totals.find((t) => t.lineKey === 'external:license')!;
    expect(external.eur).toBe(5500); // 3500 + 2000
  });

  it('anchor + unedited € come from the server stored €, not hours×rate', () => {
    // Stored anchor € (380) deliberately != hours×rate (10 × 100 = 1000): a
    // forecast not priced at the latest rate. The panel must mirror the server.
    const r: ScenarioGridResponse = {
      ...resp(),
      rows: [
        {
          line_key: 'internal:dev',
          category: 'internal',
          kind: 'internal_role',
          sub_category_name: 'Dev',
          hourly_rate: 100,
          cells: [
            cell({ month: '2026-05', display_value: 10, amount_eur: 380, anchor_value: 10, anchor_amount_eur: 380, field: 'hours' }),
          ],
        },
      ],
    };
    const noEdit = computeLineTotals(r, new Map());
    // Unedited: uses stored € (380), NOT 10 × 100 = 1000.
    expect(noEdit[0].eur).toBe(380);
    expect(noEdit[0].anchorEur).toBe(380);

    // Edited to 12h: preview derives 12 × 100 = 1200 (matches the server write
    // recompute), while the anchor stays the stored 380.
    const we: WorkingEdits = new Map();
    we.set(
      workingEditKey('internal', 'internal:dev', '2026-05'),
      mkEdit({ month: '2026-05', anchorValue: 10, newValue: 12 }),
    );
    const edited = computeLineTotals(r, we);
    expect(edited[0].eur).toBe(1200);
    expect(edited[0].anchorEur).toBe(380);
  });
});

describe('computeProjectBudget + computeDeltaVsAnchor', () => {
  it('sums line totals into a project budget', () => {
    const totals = computeLineTotals(resp(), new Map());
    const budget = computeProjectBudget(totals);
    expect(budget.eur).toBe(20000); // 16000 + 4000
    expect(budget.anchorEur).toBe(20000);
  });

  it('delta is 0 with no edits', () => {
    const totals = computeLineTotals(resp(), new Map());
    expect(computeDeltaVsAnchor(computeProjectBudget(totals))).toBe(0);
  });

  it('delta reflects pending edits', () => {
    const we: WorkingEdits = new Map();
    we.set(workingEditKey('internal', 'internal:dev', '2026-05'), mkEdit({ newValue: 120 }));
    const totals = computeLineTotals(resp(), we);
    const budget = computeProjectBudget(totals);
    // live 24000 (20000 internal + 4000 ext) − anchor 20000 = +4000
    expect(budget.eur).toBe(24000);
    expect(computeDeltaVsAnchor(budget)).toBe(4000);
  });

  it('clearing edits returns delta to 0', () => {
    const totals = computeLineTotals(resp(), new Map());
    expect(computeDeltaVsAnchor(computeProjectBudget(totals))).toBe(0);
  });

  it('zeroing a cell (newValue null) reduces the budget', () => {
    const we: WorkingEdits = new Map();
    we.set(workingEditKey('internal', 'internal:dev', '2026-05'), mkEdit({ newValue: null }));
    const totals = computeLineTotals(resp(), we);
    const budget = computeProjectBudget(totals);
    // internal live: (0 + 80) × 100 = 8000; + ext 4000 = 12000; delta = -8000
    expect(budget.eur).toBe(12000);
    expect(computeDeltaVsAnchor(budget)).toBe(-8000);
  });
});
