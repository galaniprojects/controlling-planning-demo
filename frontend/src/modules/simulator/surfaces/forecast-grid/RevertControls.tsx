/**
 * Project-scope Session 2 — revert controls.
 *
 * Three granularities of revert, routed to the ScenarioContext overlay methods
 * via the surface working-edits hook:
 *   - per cell  — one entry per edited (line, month) cell.
 *   - per line  — one "revert line" entry per line that has any edit.
 *   - all       — "Revert all edits" behind a Dialog confirm.
 *
 * The edited set is the union of (a) the surface-local working edits and (b)
 * any server cell flagged `is_changed` (an overlay that landed in a prior
 * session / before this mount). Each revert also clears the matching local
 * working state through the hook callbacks.
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Undo2 } from 'lucide-react';
import { formatMonthShort } from '@/lib/yearColumns';
import type { ScenarioGridResponse, ScenarioGridRow } from '../../api/scenariosApi';
import type { WorkingEdits } from './forecastGridAdapter';

interface EditedCell {
  lineKey: string;
  lineName: string;
  month: string;
}

interface Props {
  grid: ScenarioGridResponse;
  workingEdits: WorkingEdits;
  onRevertCell: (row: ScenarioGridRow, month: string) => void | Promise<void>;
  onRevertLine: (lineKey: string) => void | Promise<void>;
  onRevertAll: () => void | Promise<void>;
  busy?: boolean;
}

export function RevertControls({
  grid,
  workingEdits,
  onRevertCell,
  onRevertLine,
  onRevertAll,
  busy,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rowByLine = useMemo(() => {
    const m = new Map<string, ScenarioGridRow>();
    for (const r of grid.rows) m.set(r.line_key, r);
    return m;
  }, [grid]);

  // Union of working edits + server-changed cells, deduped by line|month.
  const editedCells = useMemo<EditedCell[]>(() => {
    const seen = new Set<string>();
    const out: EditedCell[] = [];
    const push = (lineKey: string, month: string) => {
      const k = `${lineKey}|${month}`;
      if (seen.has(k)) return;
      const row = rowByLine.get(lineKey);
      if (!row) return;
      seen.add(k);
      out.push({ lineKey, lineName: row.sub_category_name, month });
    };
    for (const edit of workingEdits.values()) push(edit.lineKey, edit.month);
    for (const row of grid.rows) {
      for (const cell of row.cells) {
        if (cell.is_changed) push(row.line_key, cell.month);
      }
    }
    return out.sort(
      (a, b) =>
        a.lineName.localeCompare(b.lineName) || a.month.localeCompare(b.month),
    );
  }, [grid, workingEdits, rowByLine]);

  const editedLineKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of editedCells) set.add(c.lineKey);
    return Array.from(set);
  }, [editedCells]);

  if (editedCells.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          No cell edits yet. Click a future cell in the grid to edit it; reverts
          appear here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Edits ({editedCells.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span className="ml-1.5">Revert all edits</span>
        </Button>
      </div>

      {/* Per-line reverts */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          By line
        </p>
        <div className="flex flex-wrap gap-2">
          {editedLineKeys.map((lineKey) => {
            const row = rowByLine.get(lineKey);
            return (
              <Button
                key={lineKey}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void onRevertLine(lineKey)}
              >
                <Undo2 className="h-3 w-3 mr-1" />
                {row?.sub_category_name ?? lineKey}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Per-cell reverts */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          By cell
        </p>
        <div className="space-y-1">
          {editedCells.map((c) => {
            const row = rowByLine.get(c.lineKey);
            return (
              <div
                key={`${c.lineKey}|${c.month}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground truncate pr-2">
                  {c.lineName}
                  <span className="text-muted-foreground">
                    {' · '}
                    {formatMonthShort(c.month)} {c.month.slice(2, 4)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={busy || !row}
                  onClick={() => row && void onRevertCell(row, c.month)}
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  Revert
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert all cell edits?</DialogTitle>
            <DialogDescription>
              This clears every cell overlay for this project in the scenario.
              Macros are not affected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                await onRevertAll();
                setConfirmOpen(false);
              }}
            >
              Revert all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
