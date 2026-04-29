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
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { formatCurrency, formatCurrencyCompact, formatCurrencyDetailed } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { workbenchApi } from '@/api/endpoints';
import type {
  ForecastGridRow,
  ForecastChange,
  ForecastMonthCell,
  SuggestionItem,
  MixedGridResponse,
  MixedGridColumn,
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

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return `${MONTH_SHORT[parseInt(mo, 10) - 1] ?? ''} ${y.slice(2)}`;
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
  const [editingCell, setEditingCell] = useState<string | null>(null);
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
  // column into its three constituent months (UI-only refinement).
  const visibleColumns = useMemo<MixedGridColumn[]>(() => {
    if (!grid) return [];
    const out: MixedGridColumn[] = [];
    for (const col of grid.columns) {
      if (col.cell_type === 'quarterly' && expandedQuarters.has(col.key)) {
        const months = quarterMonths(col.key);
        for (const m of months) {
          out.push({
            key: `${col.key}::expanded::${m}`,
            label: m,
            cell_type: 'monthly',
          });
        }
      }
      out.push(col);
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

  const internalRows = useMemo(
    () => rows.filter((r) => r.category === 'internal'),
    [rows],
  );
  const externalRows = useMemo(
    () => rows.filter((r) => r.category === 'external'),
    [rows],
  );

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

  // Identify the boundary column index for the blue divider.
  const lastMonthlyIdx = useMemo(() => {
    if (!grid) return -1;
    let idx = -1;
    grid.columns.forEach((c, i) => {
      if (c.cell_type === 'monthly') idx = i;
    });
    return idx;
  }, [grid]);

  function isBoundaryColumn(col: MixedGridColumn, idx: number): boolean {
    if (lastMonthlyIdx < 0) return false;
    if (idx === 0) return false;
    if (col.cell_type !== 'quarterly') return false;
    const prev = visibleColumns[idx - 1];
    return prev?.cell_type === 'monthly';
  }

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
   * per `[C-FG-03]`. Uses display values (hours for internal, EUR for
   * external) — same convention as monthly cells. */
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

  function getDisplayValue(
    category: string,
    row: ForecastGridRow,
    col: MixedGridColumn,
  ): {
    /** For monthly: months covered = [single]. For quarterly: covers 3 months. */
    months: string[];
    /** Sum of working+forecast values for those months. */
    displayValue: number;
    /** Original (pre-edit) total for those months. */
    originalValue: number;
    /** True if any monthly cell in the range has a working change. */
    isChanged: boolean;
    /** True if any working change came from a suggestion. */
    isSuggested: boolean;
    /** True if any constituent month is provisional. */
    isProvisional: boolean;
    /** True if every constituent month is editable (>= DEMO_DATE). */
    canEdit: boolean;
    /** Synthetic key like "Q2 2027" → resolves to the parent quarter for editing. */
    editKey: string;
    /** True for cells that came from quarter-expansion ("ghost" sub-months). */
    isExpandedSub: boolean;
  } {
    const isInternal = category === 'internal';
    const isExpandedSub = col.key.includes('::expanded::');
    let monthsCovered: string[];
    let editKey: string;

    if (isExpandedSub) {
      const month = col.key.split('::')[2];
      monthsCovered = [month];
      editKey = month;
    } else if (col.cell_type === 'monthly') {
      monthsCovered = [col.key];
      editKey = col.key;
    } else {
      monthsCovered = quarterMonths(col.key);
      editKey = col.key;
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
      if (provisionalIndex.get(`${category}|${row.sub_category}|${m}`)) {
        isProvisional = true;
      }
      if (!isEditableMonth(m)) canEdit = false;
    }

    return {
      months: monthsCovered,
      displayValue: Math.round(displayValue * 100) / 100,
      originalValue: Math.round(originalValue * 100) / 100,
      isChanged,
      isSuggested,
      isProvisional,
      canEdit,
      editKey,
      isExpandedSub,
    };
  }

  function commitEdit(
    category: string,
    row: ForecastGridRow,
    col: MixedGridColumn,
    raw: string,
  ) {
    const newVal = parseFloat(raw);
    if (Number.isNaN(newVal) || newVal < 0) {
      setEditingCell(null);
      return;
    }
    const { isExpandedSub } = getDisplayValue(category, row, col);
    if (isExpandedSub) {
      // Synthetic monthly column under an expanded quarter — write the
      // single month directly.
      const month = col.key.split('::')[2];
      applyMonthlyChange(category, row, month, newVal);
    } else if (col.cell_type === 'monthly') {
      applyMonthlyChange(category, row, col.key, newVal);
    } else {
      applyQuarterlyChange(category, row, col.key, newVal);
    }
    setEditingCell(null);
  }

  function renderProvisionalDot() {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label="Provisional value"
              className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mr-1 align-middle"
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="text-xs">
              Provisional. Manual edit will clear the flag on save per [C-FG-07].
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  function renderEditableCell(
    category: string,
    row: ForecastGridRow,
    col: MixedGridColumn,
  ) {
    const isInternal = category === 'internal';
    const display = getDisplayValue(category, row, col);
    const cellKey = `${row.sub_category}:${col.key}`;
    const isEditing = editingCell === cellKey;

    if (isEditing && display.canEdit) {
      return (
        <Input
          type="number"
          step="any"
          className="h-7 w-24 text-right text-sm p-1"
          defaultValue={display.displayValue}
          autoFocus
          onBlur={(e) => commitEdit(category, row, col, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitEdit(category, row, col, (e.target as HTMLInputElement).value);
            }
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    if (display.months.length === 0) {
      return <span className="text-muted-foreground/40">—</span>;
    }

    const rate = isInternal ? row.hourly_rate ?? 0 : 0;
    const eurValue = isInternal ? display.displayValue * rate : display.displayValue;

    if (!display.canEdit) {
      return (
        <div className="bg-muted/50 rounded px-1.5 py-0.5 inline-block min-w-[60px]">
          <span className="text-sm text-muted-foreground inline-flex items-center">
            {display.isProvisional && renderProvisionalDot()}
            {isInternal
              ? `${display.displayValue.toLocaleString('de-DE')} hrs`
              : formatCurrency(display.displayValue)}
          </span>
        </div>
      );
    }

    return (
      <div>
        <button
          className={cn(
            'text-sm font-medium cursor-pointer px-1.5 py-0.5 rounded transition-colors w-full text-right',
            display.isSuggested && 'bg-primary/5 text-primary',
            display.isChanged &&
              !display.isSuggested &&
              'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
            !display.isChanged && 'hover:bg-accent',
          )}
          onClick={() => setEditingCell(cellKey)}
        >
          <span className="inline-flex items-center justify-end gap-1">
            {display.isProvisional && renderProvisionalDot()}
            {isInternal
              ? `${display.displayValue.toLocaleString('de-DE')} hrs`
              : formatCurrency(display.displayValue)}
          </span>
        </button>
        {isInternal && rate > 0 && (
          <span className="block text-[10px] text-muted-foreground text-right pr-1.5">
            {formatCurrencyDetailed(eurValue)}
          </span>
        )}
      </div>
    );
  }

  function formatColumnLabel(col: MixedGridColumn): string {
    if (col.key.includes('::expanded::')) {
      return formatMonth(col.key.split('::')[2]);
    }
    if (col.cell_type === 'monthly') return formatMonth(col.key);
    return col.key.slice(5); // 'YYYY-QN' → 'QN'
  }

  function columnYear(col: MixedGridColumn): number {
    return parseInt(col.key.slice(0, 4), 10);
  }

  // Group years for the year header row.
  const yearGroups = useMemo(() => {
    const map = new Map<number, MixedGridColumn[]>();
    for (const col of visibleColumns) {
      const y = columnYear(col);
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(col);
    }
    return Array.from(map.entries())
      .map(([year, cols]) => ({ year, count: cols.length }))
      .sort((a, b) => a.year - b.year);
  }, [visibleColumns]);

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

      <div className="border border-border rounded-lg overflow-x-auto max-w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead
                className="sticky left-0 bg-muted/50 z-10 border-r border-border whitespace-nowrap min-w-[200px]"
                rowSpan={2}
              >
                Line item
              </TableHead>
              {yearGroups.map((g) => (
                <TableHead
                  key={`yr-${g.year}`}
                  colSpan={g.count}
                  className="text-center border-l-2 border-border text-xs font-semibold text-primary"
                >
                  {g.year}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="bg-muted/30">
              {visibleColumns.map((col, idx) => {
                const isQuarterly = col.cell_type === 'quarterly';
                const expandable = isQuarterly && !col.key.includes('::expanded::');
                const isExpanded = expandable && expandedQuarters.has(col.key);
                const isExpandedSub = col.key.includes('::expanded::');
                const yearStart =
                  idx === 0 || columnYear(col) !== columnYear(visibleColumns[idx - 1]);
                const boundary = isBoundaryColumn(col, idx);
                const monthEditable =
                  col.cell_type === 'monthly' && !isExpandedSub && !isEditableMonth(col.key);
                return (
                  <TableHead
                    key={`col-${col.key}`}
                    className={cn(
                      'text-right min-w-[90px] text-xs',
                      yearStart && 'border-l-2 border-border',
                      boundary &&
                        'border-l-4 border-l-blue-400 dark:border-l-blue-500 bg-blue-50/40 dark:bg-blue-900/20',
                      isQuarterly &&
                        !isExpandedSub &&
                        'bg-blue-50/40 dark:bg-blue-900/20',
                      isExpandedSub && 'bg-blue-50/20 dark:bg-blue-900/10 italic',
                      monthEditable && 'bg-muted/30',
                    )}
                  >
                    {expandable ? (
                      <button
                        type="button"
                        onClick={() => toggleQuarter(col.key)}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="font-tabular font-semibold">
                          {formatColumnLabel(col)}
                        </span>
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'font-tabular',
                          isQuarterly && 'font-semibold',
                          isExpandedSub && 'text-muted-foreground',
                        )}
                      >
                        {formatColumnLabel(col)}
                        {col.cell_type === 'monthly' &&
                          !isExpandedSub &&
                          !isEditableMonth(col.key) && (
                            <span className="block text-[9px] text-muted-foreground">
                              read-only
                            </span>
                          )}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {internalRows.length > 0 && (
              <>
                <TableRow className="bg-muted/30">
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
                  >
                    Internal Resources (Hours)
                  </TableCell>
                </TableRow>
                {internalRows.map((row) => (
                  <TableRow key={`${row.category}-${row.sub_category}`}>
                    <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{row.sub_category_name}</span>
                        {row.capex_opex && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1 py-0 h-3.5',
                              row.capex_opex === 'capex'
                                ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                            )}
                          >
                            {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {visibleColumns.map((col, idx) => {
                      const yearStart =
                        idx === 0 ||
                        columnYear(col) !== columnYear(visibleColumns[idx - 1]);
                      const boundary = isBoundaryColumn(col, idx);
                      const isQuarterly =
                        col.cell_type === 'quarterly' &&
                        !col.key.includes('::expanded::');
                      return (
                        <TableCell
                          key={`${row.sub_category}-${col.key}`}
                          className={cn(
                            'p-1',
                            yearStart && 'border-l-2 border-border',
                            boundary &&
                              'border-l-4 border-l-blue-400 dark:border-l-blue-500',
                            isQuarterly && 'bg-blue-50/30 dark:bg-blue-900/10',
                            col.key.includes('::expanded::') &&
                              'bg-blue-50/10 dark:bg-blue-900/5',
                          )}
                        >
                          {renderEditableCell('internal', row, col)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </>
            )}

            {externalRows.length > 0 && (
              <>
                <TableRow className="bg-muted/30">
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
                  >
                    External Costs (EUR)
                  </TableCell>
                </TableRow>
                {externalRows.map((row) => (
                  <TableRow key={`${row.category}-${row.sub_category}`}>
                    <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{row.sub_category_name}</span>
                        {row.capex_opex && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1 py-0 h-3.5',
                              row.capex_opex === 'capex'
                                ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                            )}
                          >
                            {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {visibleColumns.map((col, idx) => {
                      const yearStart =
                        idx === 0 ||
                        columnYear(col) !== columnYear(visibleColumns[idx - 1]);
                      const boundary = isBoundaryColumn(col, idx);
                      const isQuarterly =
                        col.cell_type === 'quarterly' &&
                        !col.key.includes('::expanded::');
                      return (
                        <TableCell
                          key={`${row.sub_category}-${col.key}`}
                          className={cn(
                            'p-1',
                            yearStart && 'border-l-2 border-border',
                            boundary &&
                              'border-l-4 border-l-blue-400 dark:border-l-blue-500',
                            isQuarterly && 'bg-blue-50/30 dark:bg-blue-900/10',
                            col.key.includes('::expanded::') &&
                              'bg-blue-50/10 dark:bg-blue-900/5',
                          )}
                        >
                          {renderEditableCell('external', row, col)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

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
