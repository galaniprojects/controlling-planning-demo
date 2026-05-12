/**
 * Phase 3 — Edit Forecast (mixed-granularity).
 *
 * Cluster C / Session C2 rebuild: replaces the v4 monthly-only grid with
 * the mixed-granularity grid per `[C-FG-02]`. Editing rules:
 *
 *  • **Monthly cells** (near zone) emit one `ForecastChange` per edit, the
 *    same as v4.
 *  • **Quarterly cells** (outer zone) accept a single value per quarter
 *    and on save fan out into three `ForecastChange` rows — equal thirds
 *    with the cent remainder applied to the last month per `[C-FG-03]`.
 *  • Cells flagged `is_provisional` in the C1 payload show the same
 *    amber-dot marker as the read-mode grid per `[C-FG-08]`. Manual edits
 *    are represented as `ForecastChange` rows; on commit through the CR
 *    path the backend clears `is_provisional` for those months per
 *    `[C-FG-07]`.
 *  • A 4-px blue divider separates the monthly and quarterly zones.
 *
 * The wizard contract (`workingChanges: ForecastChange[]`, `onCellChange`)
 * is unchanged so the existing review/submit phases continue to work.
 *
 * Refactor note (define-page-redesign): the grid rendering moved into the
 * shared `MonthCategoryGrid` primitive at
 * `frontend/src/components/shared/MonthCategoryGrid.tsx`. This file remains
 * the forecast-cycle integration point (data fetch, working-change tracking,
 * quarterly-distribution, change-summary footer) but no longer owns the
 * table layout. The Define Financials tab consumes the same primitive with
 * baseline-write callbacks.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { formatCurrencyCompact } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { workbenchApi } from '@/api/endpoints';
import {
  MonthCategoryGrid,
  type MonthCategoryGridColumn,
  type MonthCategoryGridRow,
  type MonthCategoryGridCellState,
} from '@/components/shared/MonthCategoryGrid';
import type {
  ForecastGridRow,
  ForecastChange,
  SuggestionItem,
  MixedGridResponse,
} from '@/types/api';

const DEMO_DATE = '2026-04';

interface Props {
  projectId: string;
  workingChanges: ForecastChange[];
  appliedSuggestionIds: number[];
  suggestions: SuggestionItem[];
  onCellChange: (change: ForecastChange) => void;
  onSaveAndReview: () => void;
  loading: boolean;
}

function quarterMonths(qKey: string): string[] {
  // 'YYYY-QN' → ['YYYY-MM', 'YYYY-MM', 'YYYY-MM']
  const year = parseInt(qKey.slice(0, 4), 10);
  const qNum = parseInt(qKey.slice(6), 10);
  const startMonth = (qNum - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(startMonth + i).padStart(2, '0')}`);
}

/**
 * Distribute a quarterly aggregate equally across three months. Cent
 * remainder applied to the last month per `[C-FG-03]`.
 */
function distributeQuarterly(total: number, months: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const n = months.length;
  if (n === 0) return out;
  const base = Math.floor((total * 100) / n) / 100;
  for (let i = 0; i < n - 1; i += 1) out.set(months[i], base);
  const allocated = base * (n - 1);
  out.set(months[n - 1], Math.round((total - allocated) * 100) / 100);
  return out;
}

export function Phase3EditForecast({
  projectId,
  workingChanges,
  appliedSuggestionIds,
  suggestions,
  onCellChange,
  onSaveAndReview,
  loading,
}: Props) {
  const [rows, setRows] = useState<ForecastGridRow[]>([]);
  const [grid, setGrid] = useState<MixedGridResponse | null>(null);
  const [gridLoading, setGridLoading] = useState(true);
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());

  useEffect(() => {
    setGridLoading(true);
    Promise.all([
      workbenchApi.getForecast(projectId),
      workbenchApi.getForecastGrid(projectId, { granularity: 'mixed' }),
    ])
      .then(([v4Res, mixedRes]) => {
        setRows(v4Res.items);
        setGrid(mixedRes);
        // Pre-fill from suggestions on first load (unchanged from v4 behaviour)
        if (appliedSuggestionIds.length > 0 && workingChanges.length === 0) {
          suggestions
            .filter((s) => appliedSuggestionIds.includes(s.id))
            .forEach((s) => {
              s.pre_filled_changes.forEach((pf) => {
                onCellChange({
                  category: pf.category || 'internal',
                  sub_category: pf.sub_category,
                  month: pf.month,
                  old_value: pf.old_value,
                  new_value: pf.new_value,
                  delta: pf.new_value - pf.old_value,
                  suggestion_id: s.id,
                });
              });
            });
        }
      })
      .catch(() => {
        setRows([]);
        setGrid(null);
      })
      .finally(() => setGridLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleQuarter = useCallback((qKey: string) => {
    setExpandedQuarters((prev) => {
      const next = new Set(prev);
      if (next.has(qKey)) next.delete(qKey);
      else next.add(qKey);
      return next;
    });
  }, []);

  // Visible columns: pull mixed grid columns, optionally expand a quarterly
  // column into its three constituent months (UI-only refinement). Then map
  // into the MonthCategoryGrid column shape.
  const visibleColumns = useMemo<MonthCategoryGridColumn[]>(() => {
    if (!grid) return [];
    const out: MonthCategoryGridColumn[] = [];
    for (const col of grid.columns) {
      if (col.cell_type === 'quarterly' && expandedQuarters.has(col.key)) {
        const months = quarterMonths(col.key);
        for (const m of months) {
          out.push({
            key: `${col.key}::expanded::${m}`,
            label: undefined,
            cell_type: 'monthly',
          });
        }
      }
      out.push({ key: col.key, label: undefined, cell_type: col.cell_type });
    }
    return out;
  }, [grid, expandedQuarters]);

  // Index C1 cells by (category, sub_category, key) for fast provisional lookup.
  const provisionalIndex = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!grid) return map;
    for (const r of grid.rows) {
      for (const c of r.cells) {
        map.set(`${r.category}|${r.sub_category}|${c.key}`, c.is_provisional);
      }
    }
    return map;
  }, [grid]);

  const getWorkingValue = useCallback(
    (subCategory: string, month: string) =>
      workingChanges.find(
        (c) => c.sub_category === subCategory && c.month === month,
      ),
    [workingChanges],
  );

  // Convert all deltas to EUR for the impact summary.
  const totalDeltaEur = workingChanges.reduce((sum, c) => {
    if (c.category === 'internal') {
      const row = rows.find(
        (r) => r.sub_category === c.sub_category && r.category === 'internal',
      );
      const rate = row?.hourly_rate ?? 0;
      return sum + c.delta * rate;
    }
    return sum + c.delta;
  }, 0);

  const isEditableMonth = (month: string) => month >= DEMO_DATE;

  /** Apply a monthly edit. Used both for direct monthly cells and as the
   * underlying primitive when a quarterly value distributes. */
  const applyMonthlyChange = useCallback(
    (
      category: string,
      row: ForecastGridRow,
      month: string,
      newValue: number,
    ) => {
      const cell = row.months.find((c) => c.month === month);
      const isInternal = category === 'internal';
      const originalValue = cell ? (isInternal ? cell.forecast_hours : cell.forecast_amount) : 0;
      const existing = getWorkingValue(row.sub_category, month);
      const oldValue = existing?.old_value ?? originalValue;
      onCellChange({
        category,
        sub_category: row.sub_category,
        month,
        old_value: oldValue,
        new_value: newValue,
        delta: newValue - oldValue,
        suggestion_id: existing?.suggestion_id,
      });
    },
    [getWorkingValue, onCellChange],
  );

  /** Apply a quarterly edit by fanning out into three monthly changes
   * per `[C-FG-03]`. */
  const applyQuarterlyChange = useCallback(
    (
      category: string,
      row: ForecastGridRow,
      quarterKey: string,
      newValue: number,
    ) => {
      const months = quarterMonths(quarterKey);
      const distribution = distributeQuarterly(newValue, months);
      for (const m of months) {
        const v = distribution.get(m) ?? 0;
        applyMonthlyChange(category, row, m, v);
      }
    },
    [applyMonthlyChange],
  );

  // ---- Adapt ForecastGridRow → MonthCategoryGridRow ------------------------
  const adapterRows = useMemo<MonthCategoryGridRow[]>(
    () =>
      rows.map((r) => ({
        category: r.category,
        sub_category: r.sub_category,
        sub_category_name: r.sub_category_name,
        capex_opex: r.capex_opex,
        hourly_rate: r.hourly_rate,
      })),
    [rows],
  );

  const rowByKey = useMemo(() => {
    const map = new Map<string, ForecastGridRow>();
    for (const r of rows) map.set(`${r.category}|${r.sub_category}`, r);
    return map;
  }, [rows]);

  // ---- Per-cell state derivation (forecast-cycle semantics) ----------------
  const getCellState = useCallback(
    (
      mcRow: MonthCategoryGridRow,
      col: MonthCategoryGridColumn,
    ): MonthCategoryGridCellState => {
      const row = rowByKey.get(`${mcRow.category}|${mcRow.sub_category}`);
      if (!row) {
        return { displayValue: 0, canEdit: false, isEmpty: true };
      }
      const isInternal = mcRow.category === 'internal';
      const expandedSub = col.key.includes('::expanded::');
      let monthsCovered: string[];
      if (expandedSub) {
        monthsCovered = [col.key.split('::')[2]];
      } else if (col.cell_type === 'monthly') {
        monthsCovered = [col.key];
      } else {
        monthsCovered = quarterMonths(col.key);
      }

      let originalValue = 0;
      let displayValue = 0;
      let isChanged = false;
      let isSuggested = false;
      let isProvisional = false;
      let canEdit = monthsCovered.length > 0;
      for (const m of monthsCovered) {
        const cell = row.months.find((c) => c.month === m);
        const orig = cell ? (isInternal ? cell.forecast_hours : cell.forecast_amount) : 0;
        originalValue += orig;
        const change = getWorkingValue(row.sub_category, m);
        const eff = change ? change.new_value : orig;
        displayValue += eff;
        if (change) {
          isChanged = true;
          if (change.suggestion_id != null) isSuggested = true;
        }
        if (provisionalIndex.get(`${mcRow.category}|${row.sub_category}|${m}`)) {
          isProvisional = true;
        }
        if (!isEditableMonth(m)) canEdit = false;
      }
      void originalValue; // available if a future caller wants delta display

      return {
        displayValue: Math.round(displayValue * 100) / 100,
        isChanged,
        isSuggested,
        isProvisional,
        canEdit,
      };
    },
    [rowByKey, getWorkingValue, provisionalIndex],
  );

  // ---- onCellChange adapter ----------------------------------------------
  const handleCellChange = useCallback(
    (
      mcRow: MonthCategoryGridRow,
      col: MonthCategoryGridColumn,
      newValue: number,
    ) => {
      const row = rowByKey.get(`${mcRow.category}|${mcRow.sub_category}`);
      if (!row) return;
      const expandedSub = col.key.includes('::expanded::');
      if (expandedSub) {
        const month = col.key.split('::')[2];
        applyMonthlyChange(mcRow.category, row, month, newValue);
      } else if (col.cell_type === 'monthly') {
        applyMonthlyChange(mcRow.category, row, col.key, newValue);
      } else {
        applyQuarterlyChange(mcRow.category, row, col.key, newValue);
      }
    },
    [rowByKey, applyMonthlyChange, applyQuarterlyChange],
  );

  if (gridLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!grid) {
    return (
      <p className="text-sm text-muted-foreground">
        Forecast grid unavailable.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Phase 3: Edit Forecast (mixed-granularity)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Click any cell to edit. Past months are read-only. Within the next
          {' '}
          {grid.granularity_boundary_months}
          {' '}
          months you edit individual months; beyond the blue boundary you edit
          a quarterly aggregate which the system distributes equally across
          its three months on save (per [C-FG-03]).
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-card border border-border" />
          Monthly zone (next {grid.granularity_boundary_months} months)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" />
          Quarterly zone (out to {grid.horizon_end_month})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          Provisional
        </span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-help">
                <Info className="h-3.5 w-3.5" />
                Click a quarter header to expand it into months
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">
                Expanded sub-months let you edit a single month inside a
                quarter without touching the other two.
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <MonthCategoryGrid
        rows={adapterRows}
        columns={visibleColumns}
        getCellState={getCellState}
        onCellChange={handleCellChange}
        groups={[
          { key: 'internal', label: 'Internal Resources (Hours)' },
          { key: 'external', label: 'External Costs (EUR)' },
        ]}
        quarterExpansion={{
          expanded: expandedQuarters,
          onToggle: toggleQuarter,
        }}
      />

      {/* Change summary bar */}
      <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {workingChanges.length} change{workingChanges.length !== 1 ? 's' : ''}
          {totalDeltaEur !== 0 && (
            <span
              className={cn(
                'ml-2 font-medium',
                totalDeltaEur > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400',
              )}
            >
              (total impact: {totalDeltaEur > 0 ? '+' : ''}
              {formatCurrencyCompact(totalDeltaEur)})
            </span>
          )}
        </span>
        <div className="flex gap-2">
          {workingChanges.length === 0 && (
            <Button
              variant="outline"
              onClick={onSaveAndReview}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Keep as is'}
            </Button>
          )}
          <Button
            onClick={onSaveAndReview}
            disabled={loading || workingChanges.length === 0}
          >
            {loading ? 'Saving...' : 'Review Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
