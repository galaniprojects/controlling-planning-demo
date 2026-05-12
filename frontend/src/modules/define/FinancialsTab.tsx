/**
 * FinancialsTab — Define page Financials tab.
 *
 * Two complementary surfaces share one Save button, per the Define-page
 * redesign:
 *
 *   1. **Quick sizing block** — total_budget + capex/opex split + t-shirt
 *      badge (derived from total_budget against admin thresholds, server-
 *      computed and echoed back on Save). The lightweight path for DoI 1–2
 *      screening where a PL just needs a number.
 *
 *   2. **Full baseline plan grid** — month-by-month × category-by-category
 *      baseline rows, using the shared `MonthCategoryGrid` primitive (same
 *      grid the Workbench Phase 3 forecast uses). Writes to the `Baseline`
 *      table — distinct from `Forecast`.
 *
 * The grid is collapsible to preserve vertical real estate when the user
 * is just sizing the project.
 *
 * Both surfaces flow through one `useDirtyBuffer<FinancialsBuffer>`. The
 * footer Save assembles a `ProjectFinancialsUpdate` payload from the diff
 * against the loaded baseline and posts it once. The PUT response includes
 * BOTH the refreshed project and the hydrated baseline grid so the tab can
 * re-render without a second round trip.
 *
 * Baseline-row INITIAL LOAD: there is no dedicated GET endpoint yet —
 * tabs-builder pivots the existing `workbenchApi.getForecast` payload
 * (which returns per-row baseline_hours/baseline_amount alongside forecast
 * values) into the BaselineGridRow shape on read. A follow-up backend
 * session can introduce a dedicated GET if needed; the read pattern is
 * fully encapsulated here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  MonthCategoryGrid,
  type MonthCategoryGridColumn,
  type MonthCategoryGridRow,
  type MonthCategoryGridCellState,
} from '@/components/shared/MonthCategoryGrid';
import { workbenchApi } from '@/api/endpoints';
import { defineApi } from './api';
import { useDirtyBuffer } from './useDirtyBuffer';
import type {
  BaselineGridRow,
  CapexOpex,
  ProjectDefineResponse,
  ProjectFinancialsUpdate,
  TshirtSize,
} from '@/types/define';
import type { ForecastGridRow } from '@/types/api';
import { cn } from '@/lib/utils';
import { formatCurrencyDetailed } from '@/lib/formatters';
import { EmptyState } from '@/components/shared/EmptyState';

interface Props {
  /** Canonical project record loaded by the Define shell at the page level. */
  project: ProjectDefineResponse;
  /**
   * Callback when Save returns a refreshed project — lets the shell update
   * sibling tabs (e.g. Identity reflects the new capex_opex).
   */
  onProjectUpdated?: (project: ProjectDefineResponse) => void;
  /** Dirty pip signal back to the shell tab label. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Read-only mode (e.g. executive / CC owner). */
  readOnly?: boolean;
}

/** Buffer shape — drives diff against baseline for the PUT payload. */
interface FinancialsBuffer {
  total_budget: number | null;
  capex_opex: CapexOpex;
  rows: BaselineGridRow[];
  /** True once the rows have been touched (controls whether `rows` is sent). */
  rowsDirty: boolean;
}

const EMPTY_BUFFER_SENTINEL: FinancialsBuffer = {
  total_budget: null,
  capex_opex: 'opex',
  rows: [],
  rowsDirty: false,
};

/**
 * Pivot ForecastGridRow[] into BaselineGridRow[] — used for the initial
 * load. We pull the BASELINE fields off each monthly cell (not the
 * forecast ones).
 */
function pivotForecastRowsToBaseline(
  rows: ForecastGridRow[],
): BaselineGridRow[] {
  // Keep every month the server sent — including legitimate zero-valued
  // baseline cells. Dropping zeros would hide rows the user explicitly
  // set to zero (and that the grid needs to display so the user can
  // edit them back).
  return rows.map((r) => ({
    category: r.category as 'internal' | 'external',
    sub_category: r.sub_category,
    capex_opex: (r.capex_opex as CapexOpex | undefined) ?? undefined,
    months: r.months.map((m) => ({
      month: m.month,
      amount_eur: m.baseline_amount ?? 0,
      hours: r.category === 'internal' ? m.baseline_hours ?? 0 : null,
    })),
  }));
}

/** Diff helper: return only the parts of `buffer` that differ from `base`. */
function diffFinancialsPayload(
  buffer: FinancialsBuffer,
  base: FinancialsBuffer,
): ProjectFinancialsUpdate {
  const patch: ProjectFinancialsUpdate = {};
  if (buffer.total_budget !== base.total_budget) {
    patch.total_budget = buffer.total_budget;
  }
  if (buffer.capex_opex !== base.capex_opex) {
    patch.capex_opex = buffer.capex_opex;
  }
  if (buffer.rowsDirty) {
    patch.rows = buffer.rows;
  }
  return patch;
}

/** Render a t-shirt size badge. */
function TshirtBadge({ size }: { size: TshirtSize | null }) {
  if (!size) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        —
      </Badge>
    );
  }
  const tone =
    size === 'XS' || size === 'S'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : size === 'M'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-semibold border-0', tone)}
    >
      {size}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancialsTab({
  project,
  onProjectUpdated,
  onDirtyChange,
  readOnly = false,
}: Props) {
  const [initialBuffer, setInitialBuffer] = useState<FinancialsBuffer | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  // Column horizon: derived from the loaded ForecastGridRow data (and
  // project start_month / end_month). For now we expose the same columns
  // the forecast read returns — keyed monthly across the planning horizon.
  const [columns, setColumns] = useState<MonthCategoryGridColumn[]>([]);
  // Cache the sub_category display labels from the forecast read.
  const [subCategoryNames, setSubCategoryNames] = useState<
    Record<string, string>
  >({});
  // Cache hourly rates for internal rows (for the EUR derived sub-line).
  const [hourlyRates, setHourlyRates] = useState<Record<string, number | null>>(
    {},
  );

  // Initial load — pivot the forecast read into a baseline-shaped buffer.
  // State resets are deferred into the async callbacks so we don't trigger
  // the codebase's `react-hooks/set-state-in-effect` rule.
  //
  // `project.total_budget` / `project.capex_opex` are intentionally NOT in
  // the dep array: the buffer rebases via `onSave` after a successful Save,
  // and re-loading the entire grid on every Quick-Sizing edit would wipe
  // pending row edits in the buffer. We only re-fetch when the project id
  // itself changes (i.e. switching projects).
  useEffect(() => {
    let alive = true;
    workbenchApi
      .getForecast(project.id)
      .then((res) => {
        if (!alive) return;
        const rows = pivotForecastRowsToBaseline(res.items);
        const cols: MonthCategoryGridColumn[] = [];
        const seen = new Set<string>();
        for (const r of res.items) {
          for (const c of r.months) {
            if (!seen.has(c.month)) {
              seen.add(c.month);
              cols.push({ key: c.month, cell_type: 'monthly' });
            }
          }
        }
        cols.sort((a, b) => a.key.localeCompare(b.key));
        setColumns(cols);
        setSubCategoryNames(
          Object.fromEntries(
            res.items.map((r) => [
              `${r.category}|${r.sub_category}`,
              r.sub_category_name,
            ]),
          ),
        );
        setHourlyRates(
          Object.fromEntries(
            res.items.map((r) => [
              `${r.category}|${r.sub_category}`,
              r.hourly_rate ?? null,
            ]),
          ),
        );
        setInitialBuffer({
          total_budget: project.total_budget,
          capex_opex: project.capex_opex,
          rows,
          rowsDirty: false,
        });
        setLoadError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        // If there are no forecast rows yet, the buffer is still usable —
        // empty rows / pristine quick-sizing inputs.
        setLoadError(e.message ?? 'Failed to load baseline rows');
        setInitialBuffer({
          total_budget: project.total_budget,
          capex_opex: project.capex_opex,
          rows: [],
          rowsDirty: false,
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Sync the buffer when the shell pushes a new project (e.g. after a
  // sibling tab Save changed capex_opex).
  // Cleanly handled by the buffer's reload() — see below.
  const onSave = useCallback(
    async (current: FinancialsBuffer | null) => {
      if (!current || !initialBuffer) return current ?? undefined;
      const patch = diffFinancialsPayload(current, initialBuffer);
      if (Object.keys(patch).length === 0) {
        return current;
      }
      const result = await defineApi.updateFinancials(project.id, patch);
      // Update sub_category names from the hydrated response rows. Backend
      // wraps the rowset in `{items, total}` per the project's list-response
      // convention.
      const refreshedRows = result.baseline_rows.items;
      setSubCategoryNames((prev) => {
        const next = { ...prev };
        for (const r of refreshedRows) {
          const k = `${r.category}|${r.sub_category}`;
          const named = r.sub_category_name ?? null;
          if (named) {
            next[k] = named;
          } else if (!next[k]) {
            next[k] = r.sub_category;
          }
        }
        return next;
      });

      // Promote refreshed project up to the shell.
      if (onProjectUpdated) onProjectUpdated(result.project);

      const newBuffer: FinancialsBuffer = {
        total_budget: result.project.total_budget,
        capex_opex: result.project.capex_opex,
        rows: refreshedRows,
        rowsDirty: false,
      };
      setInitialBuffer(newBuffer);
      return newBuffer;
    },
    [project.id, initialBuffer, onProjectUpdated],
  );

  const buffer = useDirtyBuffer<FinancialsBuffer | null>({
    initial: initialBuffer,
    onSave: async (current) => {
      if (!current) return undefined;
      return onSave(current);
    },
    // Custom equality — the rows array makes shallow compare unreliable.
    equals: (a, b) => {
      if (a === b) return true;
      if (a === null || b === null) return false;
      return (
        a.total_budget === b.total_budget &&
        a.capex_opex === b.capex_opex &&
        a.rowsDirty === b.rowsDirty &&
        // Cheap row-array compare: same length + same JSON. Acceptable for
        // demo-scale row counts (~20 rows × ~24 months).
        JSON.stringify(a.rows) === JSON.stringify(b.rows)
      );
    },
  });

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(buffer.isDirty);
  }, [buffer.isDirty, onDirtyChange]);

  // ---- Adapt rows / columns into the MonthCategoryGrid contract ---------
  const adapterRows = useMemo<MonthCategoryGridRow[]>(() => {
    if (!buffer.value) return [];
    return buffer.value.rows.map((r) => {
      const key = `${r.category}|${r.sub_category}`;
      return {
        category: r.category,
        sub_category: r.sub_category,
        sub_category_name: subCategoryNames[key] ?? r.sub_category,
        capex_opex: r.capex_opex ?? null,
        hourly_rate: hourlyRates[key] ?? null,
      };
    });
  }, [buffer.value, subCategoryNames, hourlyRates]);

  const rowIndex = useMemo(() => {
    const map = new Map<string, BaselineGridRow>();
    if (!buffer.value) return map;
    for (const r of buffer.value.rows) {
      map.set(`${r.category}|${r.sub_category}`, r);
    }
    return map;
  }, [buffer.value]);

  const getCellState = useCallback(
    (
      row: MonthCategoryGridRow,
      col: MonthCategoryGridColumn,
    ): MonthCategoryGridCellState => {
      const r = rowIndex.get(`${row.category}|${row.sub_category}`);
      if (!r) return { displayValue: 0, canEdit: !readOnly, isEmpty: true };
      const cell = r.months.find((m) => m.month === col.key);
      const isInternal = row.category === 'internal';
      const value = cell
        ? isInternal
          ? cell.hours ?? 0
          : cell.amount_eur
        : 0;
      return {
        displayValue: value,
        canEdit: !readOnly,
        isEmpty: !cell || (value === 0 && !isInternal),
      };
    },
    [rowIndex, readOnly],
  );

  const handleCellChange = useCallback(
    (
      row: MonthCategoryGridRow,
      col: MonthCategoryGridColumn,
      newValue: number,
    ) => {
      buffer.setValue((prev) => {
        if (!prev) return prev;
        const isInternal = row.category === 'internal';
        const rate = hourlyRates[`${row.category}|${row.sub_category}`] ?? 0;
        const newRows = prev.rows.map((r) => {
          if (
            r.category !== row.category ||
            r.sub_category !== row.sub_category
          ) {
            return r;
          }
          const months = [...r.months];
          const idx = months.findIndex((m) => m.month === col.key);
          const newCell = isInternal
            ? {
                month: col.key,
                amount_eur: Math.round(newValue * rate * 100) / 100,
                hours: newValue,
              }
            : {
                month: col.key,
                amount_eur: newValue,
                hours: null,
              };
          if (idx >= 0) months[idx] = newCell;
          else months.push(newCell);
          months.sort((a, b) => a.month.localeCompare(b.month));
          return { ...r, months };
        });
        return { ...prev, rows: newRows, rowsDirty: true };
      });
    },
    [buffer, hourlyRates],
  );

  // ---- Render --------------------------------------------------------------
  if (!buffer.value) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const v = buffer.value;

  return (
    <div className="space-y-6">
      {/* Quick sizing block */}
      <section
        className="rounded-md border border-border bg-card p-4"
        aria-label="Quick sizing"
      >
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Quick sizing</h2>
          <p className="text-xs text-muted-foreground">
            Lightweight path for DoI 1–2 screening. The t-shirt size is derived
            from the total budget against admin thresholds.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div
            id="define-anchor-total-budget"
            data-define-anchor="define-anchor-total-budget"
            className="space-y-1"
          >
            <label
              htmlFor="financials-total-budget"
              className="text-xs font-medium text-foreground"
            >
              Total budget (EUR)
            </label>
            <Input
              id="financials-total-budget"
              type="number"
              step="any"
              min="0"
              value={v.total_budget ?? ''}
              disabled={readOnly}
              onChange={(e) => {
                const raw = e.target.value;
                buffer.patch({
                  total_budget: raw === '' ? null : parseFloat(raw),
                });
              }}
              placeholder="0"
            />
            {v.total_budget != null && (
              <span className="text-[11px] text-muted-foreground">
                {formatCurrencyDetailed(v.total_budget)}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-foreground">
              CapEx / OpEx
            </span>
            <div className="flex gap-2" role="radiogroup">
              {(['capex', 'opex'] as CapexOpex[]).map((opt) => {
                const selected = v.capex_opex === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={readOnly}
                    onClick={() => buffer.patch({ capex_opex: opt })}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? opt === 'capex'
                          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'border-border bg-background hover:bg-accent text-muted-foreground',
                      readOnly && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {opt === 'capex' ? 'CapEx' : 'OpEx'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-foreground">
              T-shirt size
            </span>
            <div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3">
              <TshirtBadge size={project.tshirt_size} />
              <span className="text-[11px] text-muted-foreground">
                Derived from total budget
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Collapsible baseline grid */}
      <section className="rounded-md border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setGridExpanded((x) => !x)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {gridExpanded ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
              Baseline plan grid
            </h2>
            <p className="ml-6 text-xs text-muted-foreground">
              Month-by-month × category-by-category baseline rows. Writes to
              the Baseline table — independent of Forecast.
            </p>
          </div>
          {adapterRows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {adapterRows.length} row{adapterRows.length === 1 ? '' : 's'}
            </span>
          )}
        </button>

        {gridExpanded && (
          <div className="mt-4">
            {loadError && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                {loadError} — proceeding with the quick-sizing block only.
              </div>
            )}
            {adapterRows.length === 0 ? (
              <EmptyState
                title="No baseline rows yet"
                description="The baseline plan grid will appear once the project has line items (internal roles or external cost types) seeded from the Workbench."
              />
            ) : (
              <MonthCategoryGrid
                rows={adapterRows}
                columns={columns}
                getCellState={getCellState}
                onCellChange={handleCellChange}
                groups={[
                  { key: 'internal', label: 'Internal Resources (Hours)' },
                  { key: 'external', label: 'External Costs (EUR)' },
                ]}
                readOnly={readOnly}
              />
            )}
          </div>
        )}
      </section>

      <FooterSaveBar
        isDirty={buffer.isDirty}
        saving={buffer.saving}
        error={buffer.error}
        onSave={() => {
          buffer.save().catch(() => {
            // error surfaced via buffer.error
          });
        }}
        onDiscard={() => buffer.reset()}
        readOnly={readOnly}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

interface FooterSaveBarProps {
  isDirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  readOnly: boolean;
}

function FooterSaveBar({
  isDirty,
  saving,
  error,
  onSave,
  onDiscard,
  readOnly,
}: FooterSaveBarProps) {
  if (readOnly) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-6 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="text-xs text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : isDirty ? (
          <span>You have unsaved changes on this tab.</span>
        ) : (
          <span>All changes saved.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty || saving}
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || saving}
          onClick={onSave}
        >
          {saving ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}

// Suppress unused-export ESLint for the sentinel constant if needed by tests.
// (Demo build relies on the buffer init path, but exposing the sentinel
// keeps test-side wiring simple.)
export { EMPTY_BUFFER_SENTINEL };
