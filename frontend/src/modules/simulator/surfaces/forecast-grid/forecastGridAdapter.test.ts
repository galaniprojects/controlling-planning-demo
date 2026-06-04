import { describe, it, expect } from 'vitest';
import type {
  ScenarioGridResponse,
  ScenarioGridCell,
} from '../../api/scenariosApi';
import {
  adaptColumns,
  adaptRows,
  buildCellIndex,
  effectiveCellValue,
  makeGetCellState,
  workingEditKey,
  type WorkingCellEdit,
  type WorkingEdits,
} from './forecastGridAdapter';

function cell(over: Partial<ScenarioGridCell>): ScenarioGridCell {
  return {
    month: '2026-05',
    display_value: 0,
    amount_eur: 0,
    anchor_value: 0,
    field: 'hours',
    can_edit: true,
    is_changed: false,
    has_overlay: false,
    anchor_amount_eur: 0,
    is_empty: false,
    ...over,
  };
}

function baseResponse(): ScenarioGridResponse {
  return {
    scenario_id: 1,
    project_id: 'proj-x',
    start_month: '2026-04',
    end_month: '2026-06',
    open_month: '2026-04',
    columns: [
      { key: '2026-04', cell_type: 'monthly' },
      { key: '2026-05', cell_type: 'monthly' },
      { key: '2026-06', cell_type: 'monthly' },
    ],
    rows: [
      {
        line_key: 'internal:dev',
        category: 'internal',
        kind: 'internal_role',
        sub_category_name: 'Senior Developer',
        hourly_rate: 100,
        cells: [
          // actuals (past) — not editable
          cell({ month: '2026-04', display_value: 40, anchor_value: 40, field: 'hours', can_edit: false }),
          // future — editable
          cell({ month: '2026-05', display_value: 80, anchor_value: 80, field: 'hours' }),
          cell({ month: '2026-06', display_value: 80, anchor_value: 80, field: 'hours' }),
        ],
      },
      {
        line_key: 'external:license',
        category: 'external',
        kind: 'external_cost',
        sub_category_name: 'SW License',
        hourly_rate: null,
        cells: [
          cell({ month: '2026-04', display_value: 1000, amount_eur: 1000, anchor_value: 1000, field: 'amount_eur', can_edit: false }),
          cell({ month: '2026-05', display_value: 2000, amount_eur: 2000, anchor_value: 2000, field: 'amount_eur' }),
          cell({ month: '2026-06', display_value: 2000, amount_eur: 2000, anchor_value: 2000, field: 'amount_eur' }),
        ],
      },
    ],
  };
}

function edit(over: Partial<WorkingCellEdit>): WorkingCellEdit {
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

describe('effectiveCellValue — precedence working > server > anchor', () => {
  it('prefers the working edit value when present', () => {
    const c = cell({ display_value: 80, anchor_value: 80 });
    expect(effectiveCellValue(c, edit({ newValue: 120 }))).toBe(120);
  });

  it('treats a null working edit value as 0 (cell zeroed)', () => {
    const c = cell({ display_value: 80, anchor_value: 80 });
    expect(effectiveCellValue(c, edit({ newValue: null }))).toBe(0);
  });

  it('falls back to the server cell display_value with no edit', () => {
    const c = cell({ display_value: 80, anchor_value: 50 });
    expect(effectiveCellValue(c, undefined)).toBe(80);
  });

  it('returns 0 when there is no cell and no edit', () => {
    expect(effectiveCellValue(undefined, undefined)).toBe(0);
  });
});

describe('adaptRows / adaptColumns', () => {
  it('maps line_key onto sub_category and forwards rate', () => {
    const rows = adaptRows(baseResponse());
    expect(rows[0].sub_category).toBe('internal:dev');
    expect(rows[0].category).toBe('internal');
    expect(rows[0].hourly_rate).toBe(100);
    expect(rows[1].sub_category).toBe('external:license');
    expect(rows[1].hourly_rate).toBeNull();
  });

  it('maps every column as monthly', () => {
    const cols = adaptColumns(baseResponse());
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.cell_type === 'monthly')).toBe(true);
    expect(cols[0].key).toBe('2026-04');
  });
});

describe('makeGetCellState', () => {
  const resp = baseResponse();
  const rows = adaptRows(resp);
  const cols = adaptColumns(resp);
  const internalRow = rows[0];
  const externalRow = rows[1];
  const aprCol = cols[0];
  const mayCol = cols[1];

  it('internal displayValue is hours (the field), not euros', () => {
    const gcs = makeGetCellState(resp, new Map());
    const state = gcs(internalRow, mayCol);
    expect(state.displayValue).toBe(80); // hours, not 8000 €
  });

  it('external displayValue is euros', () => {
    const gcs = makeGetCellState(resp, new Map());
    const state = gcs(externalRow, mayCol);
    expect(state.displayValue).toBe(2000);
  });

  it('actuals / past month → canEdit false', () => {
    const gcs = makeGetCellState(resp, new Map());
    expect(gcs(internalRow, aprCol).canEdit).toBe(false);
    expect(gcs(externalRow, aprCol).canEdit).toBe(false);
  });

  it('future month → canEdit true', () => {
    const gcs = makeGetCellState(resp, new Map());
    expect(gcs(internalRow, mayCol).canEdit).toBe(true);
  });

  it('working edit takes precedence and marks the cell changed', () => {
    const we: WorkingEdits = new Map();
    we.set(workingEditKey('internal', 'internal:dev', '2026-05'), edit({ newValue: 120 }));
    const gcs = makeGetCellState(resp, we);
    const state = gcs(internalRow, mayCol);
    expect(state.displayValue).toBe(120);
    expect(state.isChanged).toBe(true);
  });

  it('editing back to the anchor value is NOT changed', () => {
    const we: WorkingEdits = new Map();
    we.set(workingEditKey('internal', 'internal:dev', '2026-05'), edit({ newValue: 80 }));
    const gcs = makeGetCellState(resp, we);
    expect(gcs(internalRow, mayCol).isChanged).toBe(false);
  });

  it('marks changed from a server has_overlay flag with no working edit', () => {
    const r = baseResponse();
    r.rows[0].cells[1].has_overlay = true;
    r.rows[0].cells[1].display_value = 130;
    const gcs = makeGetCellState(r, new Map());
    const state = gcs(adaptRows(r)[0], cols[1]);
    expect(state.isChanged).toBe(true);
    expect(state.displayValue).toBe(130);
  });

  it('does NOT mark changed for a macro-shifted cell (is_changed, no overlay)', () => {
    const r = baseResponse();
    r.rows[0].cells[1].is_changed = true; // macro shift, no overlay row
    r.rows[0].cells[1].display_value = 130;
    const gcs = makeGetCellState(r, new Map());
    const state = gcs(adaptRows(r)[0], cols[1]);
    expect(state.isChanged).toBe(false);
    expect(state.displayValue).toBe(130);
  });

  it('quarterly column aggregates its constituent months', () => {
    // Synthesise a quarterly column spanning the three months above (Q2 2026
    // = Apr+May+Jun). Internal hours: 40 + 80 + 80 = 200.
    const gcs = makeGetCellState(resp, new Map());
    const qCol = { key: '2026-Q2', label: undefined, cell_type: 'quarterly' as const };
    const state = gcs(internalRow, qCol);
    expect(state.displayValue).toBe(200);
    // contains an actuals month → not editable
    expect(state.canEdit).toBe(false);
  });

  it('returns isEmpty when the row has no cell for the column', () => {
    const gcs = makeGetCellState(resp, new Map());
    const julCol = { key: '2026-07', label: undefined, cell_type: 'monthly' as const };
    expect(gcs(internalRow, julCol).isEmpty).toBe(true);
  });
});

describe('buildCellIndex', () => {
  it('keys cells by category|line_key|month', () => {
    const idx = buildCellIndex(baseResponse());
    const c = idx.get(workingEditKey('internal', 'internal:dev', '2026-05'));
    expect(c?.display_value).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// S6 location-aware rates — same-role-multi-location splits.
//
// The backend splits an internal role line per workforce location and encodes
// the location as the 4th line_key segment ("internal|<sub>|<role>|<location>").
// The adapter round-trips line_key onto `sub_category`, so two split lines must
// stay distinct rows + distinct cell/working-edit keys.
// ---------------------------------------------------------------------------

function splitLocationResponse(): ScenarioGridResponse {
  return {
    scenario_id: 1,
    project_id: 'proj-x',
    start_month: '2026-05',
    end_month: '2026-05',
    open_month: '2026-04',
    columns: [{ key: '2026-05', cell_type: 'monthly' }],
    rows: [
      {
        line_key: 'internal|dev|role-dev|loc-muc',
        category: 'internal',
        kind: 'internal_role',
        sub_category_name: 'Senior Developer',
        hourly_rate: 120,
        location_id: 'loc-muc',
        location_name: 'Munich',
        cells: [cell({ month: '2026-05', display_value: 80, anchor_value: 80, field: 'hours' })],
      },
      {
        line_key: 'internal|dev|role-dev|loc-bud',
        category: 'internal',
        kind: 'internal_role',
        sub_category_name: 'Senior Developer',
        hourly_rate: 70,
        location_id: 'loc-bud',
        location_name: 'Budapest',
        cells: [cell({ month: '2026-05', display_value: 40, anchor_value: 40, field: 'hours' })],
      },
    ],
  };
}

describe('S6 location-aware row identity', () => {
  it('keeps same-role-different-location lines as distinct rows (unique sub_category)', () => {
    const rows = adaptRows(splitLocationResponse());
    expect(rows).toHaveLength(2);
    expect(rows[0].sub_category).toBe('internal|dev|role-dev|loc-muc');
    expect(rows[1].sub_category).toBe('internal|dev|role-dev|loc-bud');
    expect(rows[0].sub_category).not.toBe(rows[1].sub_category);
    // Same display label — only the location chip distinguishes them in the UI.
    expect(rows[0].sub_category_name).toBe(rows[1].sub_category_name);
  });

  it('carries location_name through to the grid row', () => {
    const rows = adaptRows(splitLocationResponse());
    expect(rows[0].location_name).toBe('Munich');
    expect(rows[1].location_name).toBe('Budapest');
  });

  it('null location_name for location-less rows (e.g. external)', () => {
    const rows = adaptRows(baseResponse());
    expect(rows[0].location_name).toBeNull();
    expect(rows[1].location_name).toBeNull();
  });

  it('indexes split-line cells under distinct keys', () => {
    const idx = buildCellIndex(splitLocationResponse());
    const muc = idx.get(workingEditKey('internal', 'internal|dev|role-dev|loc-muc', '2026-05'));
    const bud = idx.get(workingEditKey('internal', 'internal|dev|role-dev|loc-bud', '2026-05'));
    expect(muc?.display_value).toBe(80);
    expect(bud?.display_value).toBe(40);
  });

  it('resolves per-split-line cell state independently (rate differs by location)', () => {
    const resp = splitLocationResponse();
    const rows = adaptRows(resp);
    const col = adaptColumns(resp)[0];
    const gcs = makeGetCellState(resp, new Map());
    expect(gcs(rows[0], col).displayValue).toBe(80); // Munich hours
    expect(gcs(rows[1], col).displayValue).toBe(40); // Budapest hours
    // Each row keeps its own location rate for €-from-hours derivation.
    expect(rows[0].hourly_rate).toBe(120);
    expect(rows[1].hourly_rate).toBe(70);
  });

  it('a working edit on one split line does not leak to the other', () => {
    const resp = splitLocationResponse();
    const rows = adaptRows(resp);
    const col = adaptColumns(resp)[0];
    const we: WorkingEdits = new Map();
    we.set(
      workingEditKey('internal', 'internal|dev|role-dev|loc-muc', '2026-05'),
      edit({ lineKey: 'internal|dev|role-dev|loc-muc', newValue: 200, anchorValue: 80 }),
    );
    const gcs = makeGetCellState(resp, we);
    expect(gcs(rows[0], col).displayValue).toBe(200); // edited Munich line
    expect(gcs(rows[0], col).isChanged).toBe(true);
    expect(gcs(rows[1], col).displayValue).toBe(40); // Budapest untouched
    expect(gcs(rows[1], col).isChanged).toBe(false);
  });
});
