/**
 * Project-scope Session 2 — forecast grid adapter (PURE).
 *
 * Maps the frozen `ScenarioGridResponse` contract onto the shared
 * `MonthCategoryGrid` primitive: one grid row per resolved line (row's
 * `sub_category` is the round-tripped `line_key`), columns straight from the
 * monthly column list, and a `getCellState` that layers the surface-local
 * working edits on top of the server cells.
 *
 * Precedence for the value shown in a cell: working-edit > server cell >
 * anchor. `effectiveCellValue` is the single helper that encodes that
 * precedence; BOTH the adapter (display) and the live-local totals
 * (`liveLocal.ts`) call it so the preview can never disagree with the grid.
 *
 * Internal lines render hours (displayValue = hours, € is derived from the
 * row's `hourly_rate` by the primitive); external lines render € directly.
 * `can_edit` comes verbatim from the server cell (false for actuals).
 */
import type {
  MonthCategoryGridColumn,
  MonthCategoryGridRow,
  MonthCategoryGridCellState,
} from '@/components/shared/MonthCategoryGrid';
import type {
  ScenarioGridCell,
  ScenarioGridResponse,
  ScenarioGridRow,
} from '../../api/scenariosApi';

// ---------------------------------------------------------------------------
// Working-edit shape (surface-local; lives in the hook, threaded in here)
// ---------------------------------------------------------------------------

/**
 * One optimistic cell edit. Keyed `category|sub_category|month` in the hook's
 * Map (see `useForecastWorkingEdits`). `newValue` is in the cell's field
 * (internal → hours, external → €); `anchorValue` is the pre-overlay value in
 * the same field, captured at edit time so revert/diff stays self-consistent.
 */
export interface WorkingCellEdit {
  category: 'internal' | 'external';
  lineKey: string;
  month: string;
  field: 'hours' | 'amount_eur';
  /** Pre-overlay value in the field (from the cell's `anchor_value`). */
  anchorValue: number;
  /** The value the user committed, in the field. `null` zeroes the cell. */
  newValue: number | null;
  /** Internal lines only — for € derivation in live-local. */
  hourlyRate: number | null;
  /** True while the optimistic edit awaits server reconciliation. */
  pending: boolean;
}

export type WorkingEdits = Map<string, WorkingCellEdit>;

export function workingEditKey(
  category: string,
  lineKey: string,
  month: string,
): string {
  return `${category}|${lineKey}|${month}`;
}

// ---------------------------------------------------------------------------
// Shared precedence helper — the single source of truth for "what value is in
// this cell right now". Returned in the cell's FIELD (hours for internal,
// € for external).
// ---------------------------------------------------------------------------

/**
 * The effective field value for a cell given an optional working edit.
 * Precedence: working-edit (if present) > server cell value > anchor.
 *
 * - working edit present → its `newValue` (null → 0).
 * - else → the server cell's `display_value` (which already folds anchor +
 *   any persisted overlay; for internal that is hours, for external €).
 * - if no cell at all → 0.
 */
export function effectiveCellValue(
  cell: ScenarioGridCell | undefined,
  edit: WorkingCellEdit | undefined,
): number {
  if (edit) return edit.newValue ?? 0;
  if (cell) return cell.display_value;
  return 0;
}

/** The anchor (pre-overlay) field value for a cell — 0 when null/absent. */
export function anchorCellValue(cell: ScenarioGridCell | undefined): number {
  if (!cell) return 0;
  return cell.anchor_value ?? 0;
}

// ---------------------------------------------------------------------------
// Row / column adapters
// ---------------------------------------------------------------------------

export function adaptColumns(
  response: ScenarioGridResponse,
): MonthCategoryGridColumn[] {
  return response.columns.map((c) => ({
    key: c.key,
    label: undefined,
    cell_type: 'monthly' as const,
  }));
}

export function adaptRows(
  response: ScenarioGridResponse,
): MonthCategoryGridRow[] {
  return response.rows.map((r) => ({
    category: r.category,
    sub_category: r.line_key, // round-tripped on write/revert
    sub_category_name: r.sub_category_name,
    capex_opex: null,
    hourly_rate: r.hourly_rate,
  }));
}

// ---------------------------------------------------------------------------
// getCellState factory
// ---------------------------------------------------------------------------

/** Index a response's cells by `category|line_key|month` for O(1) lookup. */
export function buildCellIndex(
  response: ScenarioGridResponse,
): Map<string, ScenarioGridCell> {
  const idx = new Map<string, ScenarioGridCell>();
  for (const row of response.rows) {
    for (const cell of row.cells) {
      idx.set(workingEditKey(row.category, row.line_key, cell.month), cell);
    }
  }
  return idx;
}

/** Index rows by line_key for category / rate / cell lookups. */
export function buildRowIndex(
  response: ScenarioGridResponse,
): Map<string, ScenarioGridRow> {
  const idx = new Map<string, ScenarioGridRow>();
  for (const row of response.rows) idx.set(row.line_key, row);
  return idx;
}

/**
 * Build the `getCellState` the grid consumes. Resolves both monthly columns
 * (direct) and any caller-synthesised `::expanded::` sub-month columns to a
 * single month; quarterly aggregation is handled by summing the constituent
 * months when a quarterly column is supplied (the scenario grid is monthly-
 * only by contract, but this keeps the helper symmetric with the workbench).
 */
export function makeGetCellState(
  response: ScenarioGridResponse,
  workingEdits: WorkingEdits,
): (
  row: MonthCategoryGridRow,
  col: MonthCategoryGridColumn,
) => MonthCategoryGridCellState {
  const cellIndex = buildCellIndex(response);

  function monthsForColumn(col: MonthCategoryGridColumn): string[] {
    if (col.key.includes('::expanded::')) return [col.key.split('::')[2]];
    if (col.cell_type === 'monthly') return [col.key];
    // quarterly — derive constituent months from 'YYYY-QN'
    const year = parseInt(col.key.slice(0, 4), 10);
    const qNum = parseInt(col.key.slice(6), 10);
    const startMonth = (qNum - 1) * 3 + 1;
    return [0, 1, 2].map(
      (i) => `${year}-${String(startMonth + i).padStart(2, '0')}`,
    );
  }

  return (row, col) => {
    const months = monthsForColumn(col);
    let displayValue = 0;
    let canEdit = months.length > 0;
    let anyCell = false;
    let changed = false;

    for (const month of months) {
      const key = workingEditKey(row.category, row.sub_category, month);
      const cell = cellIndex.get(key);
      const edit = workingEdits.get(key);
      if (cell) anyCell = true;
      // can_edit: server is authoritative (false for actuals). A month with no
      // cell is non-editable (out of the project's resolved range).
      if (!cell || !cell.can_edit) canEdit = false;

      const eff = effectiveCellValue(cell, edit);
      displayValue += eff;
      const anchor = anchorCellValue(cell);
      // "Changed" means a revertable hand-overlay — a local working edit that
      // differs from anchor, or a server overlay row (has_overlay). NOT raw
      // is_changed, which also fires on macro-shifted cells that carry no
      // overlay to revert (those show as a shifted curve, not a dirty cell).
      if (edit) {
        if ((edit.newValue ?? 0) !== anchor) changed = true;
      } else if (cell?.has_overlay) {
        changed = true;
      }
    }

    if (!anyCell) {
      return { displayValue: 0, canEdit: false, isEmpty: true };
    }

    // Floating-point hygiene: round to cent / hour precision for display.
    const roundedDisplay = Math.round(displayValue * 100) / 100;

    return {
      displayValue: roundedDisplay,
      isChanged: changed,
      canEdit,
    };
  };
}
