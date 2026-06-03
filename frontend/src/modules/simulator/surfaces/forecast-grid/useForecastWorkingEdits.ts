/**
 * Project-scope Session 2 — surface-local working-edits hook.
 *
 * Owns the optimistic working-edits Map (keyed `category|line_key|month`) and
 * the persistence handshake against the frozen overlay endpoints (via the
 * ScenarioContext methods). The Map is the source of truth for "what the user
 * has typed but the server hasn't yet folded in", and drives both the grid's
 * changed styling and the live-local preview.
 *
 * Edit lifecycle per cell:
 *   1. optimistic apply — set entry with `pending: true` → instant re-render.
 *   2. persist — call the matching ScenarioContext overlay method.
 *   3. reconcile — on success, re-read the returned `grid`; drop the entry if
 *      its month/line now equals anchor (revert-by-edit) else clear `pending`.
 *   4. rollback — on failure, restore the prior Map snapshot + surface error.
 *
 * Quarterly columns fan out into three monthly edits via `distributeQuarterly`
 * (the persist step issues one write per month). The scenario grid is monthly
 * by contract, so the common path is a single month.
 */
import { useCallback, useState } from 'react';
import { useScenarioContext } from '../../useScenarioContext';
import type {
  ScenarioGridResponse,
  ScenarioGridRow,
} from '../../api/scenariosApi';
import {
  anchorCellValue,
  buildCellIndex,
  workingEditKey,
  type WorkingCellEdit,
  type WorkingEdits,
} from './forecastGridAdapter';

export interface UseForecastWorkingEdits {
  workingEdits: WorkingEdits;
  /** Commit one monthly edit (optimistic → persist → reconcile). */
  commitMonthlyEdit: (
    row: ScenarioGridRow,
    month: string,
    newValue: number,
  ) => Promise<void>;
  /** Revert a single cell (clears its overlay + drops the working edit). */
  revertCell: (row: ScenarioGridRow, month: string) => Promise<void>;
  /** Revert every edit on a line. */
  revertLine: (lineKey: string) => Promise<void>;
  /** Revert every edit on the project. */
  revertAll: () => Promise<void>;
  /** Discard all local working edits without a network call (used on reload). */
  resetLocal: () => void;
  busy: boolean;
  error: string | null;
  clearError: () => void;
}

export function useForecastWorkingEdits(
  projectId: string,
  /** The latest server grid — used to read anchor/field and to reconcile. */
  grid: ScenarioGridResponse | null,
  /** Bumped by the caller to trigger a grid refetch after reconcile. */
  onReconciled: (next: ScenarioGridResponse) => void,
): UseForecastWorkingEdits {
  const {
    applyCellOverlay,
    revertCellOverlay,
    revertLineOverlay,
    clearProjectOverlay,
  } = useScenarioContext();

  const [workingEdits, setWorkingEdits] = useState<WorkingEdits>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const resetLocal = useCallback(() => setWorkingEdits(new Map()), []);

  /**
   * Reconcile the working-edits Map against a freshly returned grid: clear the
   * `pending` flag on every entry, and drop any whose month now equals the
   * cell's anchor (the server folded the edit away, e.g. a revert-by-typing).
   */
  const reconcile = useCallback((nextGrid: ScenarioGridResponse) => {
    const cellIndex = buildCellIndex(nextGrid);
    setWorkingEdits((prev) => {
      const next = new Map(prev);
      for (const [key, edit] of prev) {
        const cell = cellIndex.get(key);
        const anchor = anchorCellValue(cell);
        const effective = edit.newValue ?? 0;
        // Drop the entry when the server now reports the cell at anchor (no
        // overlay) OR the server cell already reflects the edit (is_changed
        // means the overlay landed; we keep the styling but clear pending).
        if (!cell || effective === anchor) {
          next.delete(key);
        } else {
          next.set(key, { ...edit, pending: false });
        }
      }
      return next;
    });
    onReconciled(nextGrid);
  }, [onReconciled]);

  const commitMonthlyEdit = useCallback(
    async (row: ScenarioGridRow, month: string, newValue: number) => {
      if (!grid) return;
      const key = workingEditKey(row.category, row.line_key, month);
      const cell = row.cells.find((c) => c.month === month);
      const anchor = anchorCellValue(cell);
      const field = row.category === 'internal' ? 'hours' : 'amount_eur';

      const optimistic: WorkingCellEdit = {
        category: row.category,
        lineKey: row.line_key,
        month,
        field,
        anchorValue: anchor,
        newValue,
        hourlyRate: row.hourly_rate,
        pending: true,
      };

      // Capture this key's prior entry INSIDE the updater (operates on live
      // state) so a failed write rolls back only this cell — concurrent edits
      // to other keys (e.g. a quarterly fan-out) are preserved.
      let priorEntry: WorkingCellEdit | undefined;
      setWorkingEdits((prev) => {
        priorEntry = prev.get(key);
        const next = new Map(prev);
        if (newValue === anchor) {
          // Typing the anchor value back is a revert — handled by the network
          // call below, but locally we can already drop any prior edit.
          next.delete(key);
        } else {
          next.set(key, optimistic);
        }
        return next;
      });

      setBusy(true);
      setError(null);
      try {
        const res =
          newValue === anchor
            ? await revertCellOverlay(projectId, {
                line_key: row.line_key,
                month,
                field,
              })
            : await applyCellOverlay(projectId, {
                line_key: row.line_key,
                month,
                field,
                value: newValue,
              });
        reconcile(res.grid);
      } catch (e) {
        setWorkingEdits((prev) => {
          const next = new Map(prev);
          if (priorEntry) next.set(key, priorEntry);
          else next.delete(key);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to save edit');
      } finally {
        setBusy(false);
      }
    },
    [grid, projectId, applyCellOverlay, revertCellOverlay, reconcile],
  );

  const revertCell = useCallback(
    async (row: ScenarioGridRow, month: string) => {
      const field = row.category === 'internal' ? 'hours' : 'amount_eur';
      const key = workingEditKey(row.category, row.line_key, month);
      let priorEntry: WorkingCellEdit | undefined;
      setWorkingEdits((prev) => {
        priorEntry = prev.get(key);
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setBusy(true);
      setError(null);
      try {
        const res = await revertCellOverlay(projectId, {
          line_key: row.line_key,
          month,
          field,
        });
        reconcile(res.grid);
      } catch (e) {
        setWorkingEdits((prev) => {
          const next = new Map(prev);
          if (priorEntry) next.set(key, priorEntry);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to revert cell');
      } finally {
        setBusy(false);
      }
    },
    [projectId, revertCellOverlay, reconcile],
  );

  const revertLine = useCallback(
    async (lineKey: string) => {
      // Capture the line's prior entries inside the updater; restore only those
      // on failure so concurrent edits to other lines survive.
      let priorEntries: [string, WorkingCellEdit][] = [];
      setWorkingEdits((prev) => {
        priorEntries = [...prev].filter(([, edit]) => edit.lineKey === lineKey);
        const next = new Map(prev);
        for (const [key] of priorEntries) next.delete(key);
        return next;
      });
      setBusy(true);
      setError(null);
      try {
        const res = await revertLineOverlay(projectId, lineKey);
        reconcile(res.grid);
      } catch (e) {
        setWorkingEdits((prev) => {
          const next = new Map(prev);
          for (const [key, edit] of priorEntries) next.set(key, edit);
          return next;
        });
        setError(e instanceof Error ? e.message : 'Failed to revert line');
      } finally {
        setBusy(false);
      }
    },
    [projectId, revertLineOverlay, reconcile],
  );

  const revertAll = useCallback(async () => {
    let prior: WorkingEdits = new Map();
    setWorkingEdits((prev) => {
      prior = prev;
      return new Map();
    });
    setBusy(true);
    setError(null);
    try {
      const res = await clearProjectOverlay(projectId);
      reconcile(res.grid);
    } catch (e) {
      // Restore the cleared edits, keeping any that landed during the in-flight
      // clear.
      setWorkingEdits((prev) => {
        const next = new Map(prior);
        for (const [key, edit] of prev) next.set(key, edit);
        return next;
      });
      setError(e instanceof Error ? e.message : 'Failed to revert all edits');
    } finally {
      setBusy(false);
    }
  }, [projectId, clearProjectOverlay, reconcile]);

  return {
    workingEdits,
    commitMonthlyEdit,
    revertCell,
    revertLine,
    revertAll,
    resetLocal,
    busy,
    error,
    clearError,
  };
}
