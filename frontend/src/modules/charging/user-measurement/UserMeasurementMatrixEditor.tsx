/**
 * In-grid UM matrix editor for drafts per FD-2 / [F-UM-03].
 *
 * Why a fresh component (and not `MonthCategoryGrid`):
 * the MonthCategoryGrid column model is fixed (months); UM columns are
 * dynamic (one column per active ChargingLocation, ~90 of them at full
 * scale). The interaction the spec calls for is also different —
 * single-cell click-to-edit + row/column-paste rather than month-wide
 * bulk mutation.
 *
 * Mechanic:
 * - Sticky pivot rendering identical to `UserMeasurementMatrixViewer`
 *   (lifted from the legacy admin panel for visual continuity).
 * - Click any cell to edit; non-integer entry is rejected at the field
 *   per [F-UM-01] with an inline message.
 * - Entering `0` deletes the cell (sparse delete) — matches the service
 *   layer's `set_cell(0)` semantics.
 * - Enter or Tab commits via `PATCH /versions/{id}/cells`; Escape cancels.
 * - Optimistic update with rollback on 4xx; the response surface includes
 *   `mutations[]` (per-cell audit confirmation) that we use to refresh.
 *
 * Active versions are immutable per [F-UM-02] — this component is mounted
 * only for `version.status === 'draft'`; the parent (`UserMeasurementListView`)
 * picks viewer vs editor based on status.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { userMeasurementApi } from '@/api/userMeasurement';
import type { ChargingLocationItem } from '@/types/api';
import type { UMCell, UMVersionSummary } from '@/types/userMeasurement';

interface Props {
  version: UMVersionSummary;
  cells: UMCell[];
  /** Active charging locations. Drives the editor's column set so a Blank
   *  draft renders all CLs with empty cells (sparse-omit until entered),
   *  matching spec §2 "render all active ChargingLocations as columns".
   *  Optional for back-compat; when omitted the editor falls back to the
   *  pre-FD-2.1 behaviour of inferring columns from existing cells. */
  chargingLocations?: ChargingLocationItem[];
  /** Called after a successful cell mutation so the parent can re-fetch the
   *  version detail (header counts, totals). */
  onMutated?: () => void;
}

const _UM_INT_RE = /^[+-]?\d+$/;

function fmtInt(v: number): string {
  return new Intl.NumberFormat('de-DE').format(v);
}

interface EditingCell {
  s_code: string;
  charging_location_id: string;
  draft: string;
}

export function UserMeasurementMatrixEditor({
  version, cells, chargingLocations, onMutated,
}: Props) {
  // Local model of cells so we can optimistically update without round-tripping.
  const [localCells, setLocalCells] = useState<UMCell[]>(cells);
  useEffect(() => setLocalCells(cells), [cells]);

  // User-added S-codes that have no cells yet — keeps an empty row visible
  // so the user can populate cells column-by-column on a blank draft.
  // Cleared whenever the version changes.
  const [pendingSCodes, setPendingSCodes] = useState<string[]>([]);
  useEffect(() => setPendingSCodes([]), [version.id]);

  const [newSCode, setNewSCode] = useState('');
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input whenever we enter edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const pivot = useMemo(() => {
    const sCodes = Array.from(
      new Set([...localCells.map((c) => c.s_code), ...pendingSCodes]),
    ).sort();

    // Column set is the union of active charging locations (so blank drafts
    // render with columns) and any cell-bearing locations (covers legacy
    // cells whose CL has since been deactivated — keep them visible).
    const locIdByCode = new Map<string, string>();
    const locCodeById = new Map<string, string>();
    if (chargingLocations) {
      for (const cl of chargingLocations) {
        locIdByCode.set(cl.code, cl.id);
        locCodeById.set(cl.id, cl.code);
      }
    }
    for (const c of localCells) {
      const code = c.charging_location_code ?? c.charging_location_id;
      locIdByCode.set(code, c.charging_location_id);
      locCodeById.set(c.charging_location_id, code);
    }
    const locCodes = Array.from(locIdByCode.keys()).sort();

    const lookup = new Map<string, UMCell>();
    for (const c of localCells) {
      const code = c.charging_location_code ?? c.charging_location_id;
      lookup.set(`${c.s_code}|${code}`, c);
    }
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grand = 0;
    for (const c of localCells) {
      const code = c.charging_location_code ?? c.charging_location_id;
      rowTotals[c.s_code] = (rowTotals[c.s_code] ?? 0) + c.value;
      colTotals[code] = (colTotals[code] ?? 0) + c.value;
      grand += c.value;
    }
    return {
      sCodes, locCodes, locIdByCode, locCodeById, lookup,
      rowTotals, colTotals, grand,
    };
  }, [localCells, pendingSCodes, chargingLocations]);

  const beginEdit = useCallback(
    (sCode: string, locId: string, currentValue: number | undefined) => {
      if (submitting) return;
      setEditing({
        s_code: sCode,
        charging_location_id: locId,
        draft: currentValue === undefined ? '' : String(currentValue),
      });
      setError(null);
    },
    [submitting],
  );

  const commit = useCallback(async () => {
    if (!editing) return;
    const raw = editing.draft.trim();
    // Empty input = cancel (no mutation).
    if (raw === '') {
      setEditing(null);
      return;
    }
    if (!_UM_INT_RE.test(raw)) {
      setError(
        `"${raw}" is not an integer — UM values are integer-only per [F-UM-01].`,
      );
      return;
    }
    const newValue = Number(raw);
    const existing = pivot.lookup.get(
      `${editing.s_code}|${
        // We must reverse-lookup the code from id to be safe.
        localCells.find(
          (c) =>
            c.s_code === editing.s_code
            && c.charging_location_id === editing.charging_location_id,
        )?.charging_location_code ?? editing.charging_location_id
      }`,
    );
    if (existing && existing.value === newValue) {
      // No-op — close editor.
      setEditing(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await userMeasurementApi.bulkSetCells(version.id, {
        cells: [{
          s_code: editing.s_code,
          charging_location_id: editing.charging_location_id,
          value: newValue,
        }],
      });
      // Optimistic update — patch local state.
      setLocalCells((prev) => {
        const idx = prev.findIndex(
          (c) =>
            c.s_code === editing.s_code
            && c.charging_location_id === editing.charging_location_id,
        );
        if (newValue === 0) {
          return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
        }
        if (idx === -1) {
          return [
            ...prev,
            {
              s_code: editing.s_code,
              charging_location_id: editing.charging_location_id,
              charging_location_code:
                pivot.locCodeById.get(editing.charging_location_id) ?? null,
              value: newValue,
            },
          ];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], value: newValue };
        return next;
      });
      // If the row was a pending-only S-code, clear it once the cell exists
      // so we don't carry it across refetches.
      setPendingSCodes((prev) => prev.filter((s) => s !== editing.s_code));
      setEditing(null);
      onMutated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }, [editing, version.id, pivot.locCodeById, localCells, onMutated]);

  const cancel = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  const addSCode = useCallback(() => {
    const trimmed = newSCode.trim();
    if (trimmed === '') return;
    if (pivot.sCodes.includes(trimmed)) {
      setError(`S-code "${trimmed}" is already in the matrix.`);
      return;
    }
    setPendingSCodes((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewSCode('');
    setError(null);
  }, [newSCode, pivot.sCodes]);

  // Fallback only when there's truly nothing to render — no cells *and*
  // no active charging locations to anchor columns against.
  if (pivot.sCodes.length === 0 && pivot.locCodes.length === 0) {
    return (
      <Card className="p-6 space-y-3">
        <div className="text-center text-sm text-muted-foreground">
          Draft v{version.id} has no cells yet, and no active charging locations
          are configured.
          <br />
          Use <span className="font-medium text-foreground">Import CSV</span>{' '}
          for bulk entry, or seed initial cells via{' '}
          <span className="font-medium text-foreground">Create draft → Copy from active</span>.
        </div>
        {error && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </Card>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Click any cell to edit. Enter to commit; Esc to cancel. Setting a cell
        to <span className="font-mono">0</span> deletes it (sparse storage per{' '}
        <span className="font-mono">[F-UM-01]</span>).
      </p>

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </Card>
      )}

      <div className="rounded-md border border-border overflow-auto max-h-[60vh]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-card border-r border-border min-w-[140px]">
                S-code \ Charging code
              </th>
              {pivot.locCodes.map((lc) => (
                <th
                  key={lc}
                  className="px-2 py-2 text-right font-mono font-medium text-muted-foreground min-w-[90px] whitespace-nowrap"
                >
                  {lc}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium text-foreground bg-muted border-l border-border min-w-[80px]">
                Σ Row
              </th>
            </tr>
          </thead>
          <tbody>
            {pivot.sCodes.map((sc) => (
              <tr key={sc} className="border-b border-border">
                <td className="px-2 py-1.5 font-mono font-medium text-foreground sticky left-0 bg-card border-r border-border">
                  {sc}
                </td>
                {pivot.locCodes.map((lc) => {
                  const cell = pivot.lookup.get(`${sc}|${lc}`);
                  const locId = pivot.locIdByCode.get(lc) ?? lc;
                  const isEditing =
                    editing
                    && editing.s_code === sc
                    && editing.charging_location_id === locId;

                  if (isEditing) {
                    return (
                      <td key={lc} className="px-1 py-0.5">
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          value={editing.draft}
                          onChange={(e) =>
                            setEditing({ ...editing, draft: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              commit();
                            } else if (e.key === 'Escape') {
                              cancel();
                            }
                          }}
                          onBlur={() => commit()}
                          disabled={submitting}
                          className="w-full h-7 px-1.5 text-right text-xs font-mono tabular-nums bg-background border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={lc}
                      onClick={() => beginEdit(sc, locId, cell?.value)}
                      className={cn(
                        'px-2 py-1.5 text-right cursor-pointer hover:bg-accent/60 transition-colors',
                        cell
                          ? 'tabular-nums text-foreground'
                          : 'text-muted-foreground/40',
                      )}
                      title={cell ? `Click to edit (current: ${cell.value})` : 'Click to add'}
                    >
                      {cell ? fmtInt(cell.value) : '·'}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground bg-muted border-l border-border">
                  {fmtInt(pivot.rowTotals[sc] ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted">
              <td className="px-2 py-2 font-semibold text-foreground sticky left-0 bg-muted border-r border-border">
                Σ Column
              </td>
              {pivot.locCodes.map((lc) => (
                <td
                  key={lc}
                  className="px-2 py-2 text-right tabular-nums font-semibold text-foreground"
                >
                  {fmtInt(pivot.colTotals[lc] ?? 0)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground border-l border-border">
                {fmtInt(pivot.grand)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newSCode}
          onChange={(e) => setNewSCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSCode();
            }
          }}
          placeholder="Add S-code (e.g. S301) — Enter to insert a row"
          className="flex-1 max-w-[280px] h-8 px-2 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={submitting}
        />
        <button
          type="button"
          onClick={addSCode}
          disabled={submitting || newSCode.trim() === ''}
          className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add row
        </button>
      </div>
    </div>
  );
}
