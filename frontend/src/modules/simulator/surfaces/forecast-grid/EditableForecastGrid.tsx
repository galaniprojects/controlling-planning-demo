/**
 * Project-scope Session 2 — editable forecast grid renderer.
 *
 * Presentational mount of the shared `MonthCategoryGrid` primitive against the
 * scenario grid contract. The grid DATA fetch + working-edits state are lifted
 * to `ForecastGridSurface` so the live-local panel and revert controls read the
 * exact same `grid` + `workingEdits` (a single source of truth across the
 * three panels) — this component receives them as props and is otherwise pure.
 *
 * Internal lines render hours (with the primitive's derived €-subline);
 * external lines render €. Actuals/past cells come back `can_edit:false` from
 * the server and the adapter forwards that, so the primitive renders them muted
 * and read-only. Monthly columns commit directly; the (contract-monthly) grid
 * has no quarterly columns, but quarterly fan-out is wired for symmetry with
 * the workbench should a quarterly column ever be supplied.
 */
import { useCallback, useMemo } from 'react';
import {
  MonthCategoryGrid,
  type MonthCategoryGridColumn,
  type MonthCategoryGridRow,
} from '@/components/shared/MonthCategoryGrid';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ScenarioGridResponse } from '../../api/scenariosApi';
import {
  adaptColumns,
  adaptRows,
  buildRowIndex,
  makeGetCellState,
  type WorkingEdits,
} from './forecastGridAdapter';
import { distributeQuarterly, quarterMonths } from './quarterMath';

interface Props {
  grid: ScenarioGridResponse;
  workingEdits: WorkingEdits;
  /** Persist one monthly edit through the working-edits hook. */
  onMonthlyEdit: (
    lineKey: string,
    month: string,
    newValue: number,
  ) => void | Promise<void>;
  /** True while a write is in flight (mutes the grid via the parent shell). */
  busy?: boolean;
}

export function EditableForecastGrid({
  grid,
  workingEdits,
  onMonthlyEdit,
}: Props) {
  const columns = useMemo<MonthCategoryGridColumn[]>(
    () => adaptColumns(grid),
    [grid],
  );
  const rows = useMemo<MonthCategoryGridRow[]>(() => adaptRows(grid), [grid]);
  const rowIndex = useMemo(() => buildRowIndex(grid), [grid]);

  const getCellState = useMemo(
    () => makeGetCellState(grid, workingEdits),
    [grid, workingEdits],
  );

  const handleCellChange = useCallback(
    (
      mcRow: MonthCategoryGridRow,
      col: MonthCategoryGridColumn,
      newValue: number,
    ) => {
      const lineKey = mcRow.sub_category; // round-tripped line_key
      const srcRow = rowIndex.get(lineKey);
      if (!srcRow) return;
      if (col.key.includes('::expanded::')) {
        void onMonthlyEdit(lineKey, col.key.split('::')[2], newValue);
      } else if (col.cell_type === 'monthly') {
        void onMonthlyEdit(lineKey, col.key, newValue);
      } else {
        // Quarterly fan-out (not produced by the contract, kept symmetric).
        const months = quarterMonths(col.key);
        const dist = distributeQuarterly(newValue, months);
        for (const m of months) void onMonthlyEdit(lineKey, m, dist.get(m) ?? 0);
      }
    },
    [rowIndex, onMonthlyEdit],
  );

  return (
    <MonthCategoryGrid
      rows={rows}
      columns={columns}
      getCellState={getCellState}
      onCellChange={handleCellChange}
      groups={[
        { key: 'internal', label: 'Internal Resources (Hours)' },
        { key: 'external', label: 'External Costs (EUR)' },
      ]}
      emptyState={
        <EmptyState
          title="No forecast lines"
          description="This project has no resolved forecast lines to edit in the scenario."
        />
      }
    />
  );
}
