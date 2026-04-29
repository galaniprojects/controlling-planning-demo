/**
 * MixedGranularityGrid — read-mode forecast grid with monthly columns in
 * the near zone and quarterly columns in the outer zone, separated by a
 * visual boundary divider per [C-FG-02]. Cells flagged `is_provisional`
 * carry a subtle marker per [C-FG-08]. When a comparison version is
 * selected, each changed cell shows a delta indicator (▲/▼) per [C-VC-03].
 *
 * Cluster C / Session C2.
 *
 * v5 B2 [B-OQ-02] [F-S1-04]: when `scenarioVersion` is provided the grid
 * forwards it to the backend as the `version` query so the sandbox view
 * can render scenario-fork forecast data instead of the live forecast.
 * Defaulting `scenarioVersion` to `undefined` preserves the v4 / C2 call
 * sites verbatim (additive prop). Diff helpers used by the cell renderer
 * live in `simulator/lib/cellDiffHelpers` so Compare L3 + the change-summary
 * drawer can reuse the same lookup + indicator semantics.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import {
  lookupDelta as lookupDeltaHelper,
  renderDeltaIndicator as renderDeltaIndicatorHelper,
  isMeaningfulDelta,
} from '@/modules/simulator/lib/cellDiffHelpers';
import type {
  CellDelta,
  MixedGridCell,
  MixedGridColumn,
  MixedGridResponse,
  MixedGridRow,
} from '@/types/api';

interface Props {
  projectId: string;
  /** Display name lookup keyed by sub_category id (from v4 grid). */
  nameMap: Record<string, string>;
  /** Map of `${category}|${sub}|${cell_key}` → CellDelta for overlay. */
  deltaIndex: Map<string, CellDelta>;
  /** Whether comparison overlay is active. */
  comparisonActive: boolean;
  /**
   * v5 B2 sandbox-version sentinel (e.g. `'scenario-12'`). When provided the
   * grid fetches the scenario-fork view instead of the live forecast. Build
   * via `simulator/lib/scenarioVersion.buildScenarioVersion(id)` — never
   * inline the literal. Default `undefined` = live forecast (no behaviour
   * change for v4 / C2 callers).
   */
  scenarioVersion?: string;
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatColumnLabel(col: MixedGridColumn): string {
  if (col.cell_type === 'monthly') {
    const idx = parseInt(col.key.slice(5, 7), 10) - 1;
    return MONTH_SHORT[idx] ?? col.key;
  }
  // quarterly key shape: 'YYYY-QN'
  return col.key.slice(5);
}

function columnYear(col: MixedGridColumn): number {
  return parseInt(col.key.slice(0, 4), 10);
}

interface YearGroup {
  year: number;
  columns: MixedGridColumn[];
  hasMonthly: boolean;
  hasQuarterly: boolean;
}

function groupColumnsByYear(columns: MixedGridColumn[]): YearGroup[] {
  const map = new Map<number, YearGroup>();
  for (const col of columns) {
    const y = columnYear(col);
    if (!map.has(y)) {
      map.set(y, { year: y, columns: [], hasMonthly: false, hasQuarterly: false });
    }
    const g = map.get(y)!;
    g.columns.push(col);
    if (col.cell_type === 'monthly') g.hasMonthly = true;
    else g.hasQuarterly = true;
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

export function MixedGranularityGrid({
  projectId,
  nameMap,
  deltaIndex,
  comparisonActive,
  scenarioVersion,
}: Props) {
  const [grid, setGrid] = useState<MixedGridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // v5 B2 [B-OQ-02]: forward `version` only when sandbox mode is active so
    // the live-forecast call site (workbench grid) is byte-identical.
    workbenchApi
      .getForecastGrid(projectId, {
        granularity: 'mixed',
        ...(scenarioVersion ? { version: scenarioVersion } : {}),
      })
      .then((res) => {
        if (cancelled) return;
        setGrid(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load grid');
        setGrid(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, scenarioVersion]);

  // Reset expanded quarters when project changes
  useEffect(() => {
    setExpandedQuarters(new Set());
  }, [projectId]);

  const toggleQuarter = useCallback((qKey: string) => {
    setExpandedQuarters((prev) => {
      const next = new Set(prev);
      if (next.has(qKey)) next.delete(qKey);
      else next.add(qKey);
      return next;
    });
  }, []);

  // Year groups for column headers
  const yearGroups = useMemo(
    () => (grid ? groupColumnsByYear(grid.columns) : []),
    [grid],
  );

  // Build the visible columns list, optionally expanding quarters into
  // their constituent months. Quarter expansion is a UI-only refinement
  // per [C-FG-02]; the backend always returns quarterly aggregates in the
  // mixed-granularity response, so when a quarter is expanded we synthesise
  // monthly placeholders for the three constituent months. The amount is
  // the equal division of the quarterly aggregate per [C-FG-03].
  const visibleColumns = useMemo<MixedGridColumn[]>(() => {
    if (!grid) return [];
    const out: MixedGridColumn[] = [];
    for (const col of grid.columns) {
      if (col.cell_type === 'quarterly' && expandedQuarters.has(col.key)) {
        // Insert three synthesised monthly columns before the quarterly
        // column so the user can see the underlying months.
        const year = parseInt(col.key.slice(0, 4), 10);
        const qNum = parseInt(col.key.slice(6), 10); // 'YYYY-QN' → N
        const startMonth = (qNum - 1) * 3 + 1;
        for (let i = 0; i < 3; i += 1) {
          const m = startMonth + i;
          if (m > 12) break;
          const mStr = `${year}-${String(m).padStart(2, '0')}`;
          out.push({
            key: `${col.key}::expanded::${mStr}`,
            label: mStr,
            cell_type: 'monthly',
          });
        }
      }
      out.push(col);
    }
    return out;
  }, [grid, expandedQuarters]);

  // Identify the boundary column index — last monthly column (the divider
  // appears immediately to its right).
  const lastMonthlyIdx = useMemo(() => {
    if (!grid) return -1;
    let idx = -1;
    grid.columns.forEach((c, i) => {
      if (c.cell_type === 'monthly') idx = i;
    });
    return idx;
  }, [grid]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-700 dark:text-red-400">{error}</p>;
  }

  if (!grid || grid.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No forecast data available.</p>;
  }

  const internalRows = grid.rows.filter((r) => r.category === 'internal');
  const externalRows = grid.rows.filter((r) => r.category === 'external');

  function findCell(row: MixedGridRow, key: string): MixedGridCell | undefined {
    return row.cells.find((c) => c.key === key);
  }

  function quarterMonths(qKey: string): string[] {
    const year = parseInt(qKey.slice(0, 4), 10);
    const qNum = parseInt(qKey.slice(6), 10);
    const startMonth = (qNum - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${year}-${String(startMonth + i).padStart(2, '0')}`);
  }

  // Look up delta for a cell. For expanded synthesised monthly cells under
  // a quarter, we report the parent quarter's delta divided by 3 — the
  // backend stores deltas at the cell-key granularity that was captured in
  // the snapshot, which for the outer zone is monthly storage [C-FG-01].
  // Implementation extracted to `simulator/lib/cellDiffHelpers` per v5 B2
  // [B-OQ-02] so Compare L3 + the change-summary drawer share the lookup.
  function lookupDelta(category: string, sub: string, key: string): CellDelta | undefined {
    return lookupDeltaHelper(deltaIndex, comparisonActive, category, sub, key);
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
              Provisional value (auto-distributed or pre-populated). Edit to confirm.
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  function getDisplayCell(
    row: MixedGridRow,
    col: MixedGridColumn,
  ): { hours: number; amount: number; provisional: boolean; lookupKey: string } {
    if (col.key.includes('::expanded::')) {
      // Synthesised monthly cell from an expanded quarter: divide quarterly
      // total by 3 to give an indicative monthly value (UI-only).
      const [parentQuarter, , month] = col.key.split('::');
      const parentCell = findCell(row, parentQuarter);
      const constituent = quarterMonths(parentQuarter);
      const n = constituent.length;
      const hours = parentCell ? parentCell.hours / n : 0;
      const amount = parentCell ? parentCell.amount_eur / n : 0;
      return {
        hours: Math.round(hours * 100) / 100,
        amount: Math.round(amount * 100) / 100,
        provisional: parentCell?.is_provisional ?? false,
        lookupKey: month,
      };
    }
    const cell = findCell(row, col.key);
    return {
      hours: cell?.hours ?? 0,
      amount: cell?.amount_eur ?? 0,
      provisional: cell?.is_provisional ?? false,
      lookupKey: col.key,
    };
  }

  function isBoundaryColumn(col: MixedGridColumn, idx: number): boolean {
    // True if the column to the LEFT of this one is the last monthly column
    // in the original (unexpanded) sequence. That means this column starts
    // the quarterly zone.
    if (lastMonthlyIdx < 0) return false;
    if (idx === 0) return false;
    if (col.cell_type !== 'quarterly') return false;
    const prev = visibleColumns[idx - 1];
    if (!prev) return false;
    // Boundary divider at the first quarterly column whose previous column
    // is monthly (i.e., crossing the zone boundary).
    return prev.cell_type === 'monthly';
  }

  function renderHeaderRow1() {
    return (
      <TableRow className="bg-muted/50">
        <TableHead
          className="sticky left-0 bg-muted/50 z-10 border-r border-border whitespace-nowrap min-w-[220px]"
          rowSpan={2}
        >
          Line item
        </TableHead>
        {yearGroups.map((g) => (
          <TableHead
            key={`yr-${g.year}`}
            colSpan={
              // colSpan covers each visible column whose year is g.year,
              // including any expanded sub-months under quarterly cols.
              visibleColumns.filter((c) => columnYear(c) === g.year).length
            }
            className="text-center border-l-2 border-border text-xs font-semibold text-primary"
          >
            {g.year}
            {g.hasMonthly && g.hasQuarterly && (
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                · monthly + quarterly
              </span>
            )}
          </TableHead>
        ))}
      </TableRow>
    );
  }

  function renderHeaderRow2() {
    return (
      <TableRow className="bg-muted/30">
        {visibleColumns.map((col, idx) => {
          const isQuarterly = col.cell_type === 'quarterly';
          const expandable = isQuarterly && !col.key.includes('::expanded::');
          const isExpanded = expandable && expandedQuarters.has(col.key);
          const isExpandedSub = col.key.includes('::expanded::');
          const yearStart = idx === 0 || columnYear(col) !== columnYear(visibleColumns[idx - 1]);
          const boundary = isBoundaryColumn(col, idx);
          return (
            <TableHead
              key={`col-${col.key}`}
              className={`text-right min-w-[90px] text-xs ${
                yearStart ? 'border-l-2 border-border' : ''
              } ${
                boundary
                  ? 'border-l-4 border-l-blue-400 dark:border-l-blue-500 bg-blue-50/40 dark:bg-blue-900/20'
                  : ''
              } ${isQuarterly && !isExpandedSub ? 'bg-blue-50/40 dark:bg-blue-900/20' : ''} ${
                isExpandedSub ? 'bg-blue-50/20 dark:bg-blue-900/10 italic' : ''
              }`}
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
                  className={`font-tabular ${
                    isQuarterly ? 'font-semibold' : ''
                  } ${isExpandedSub ? 'text-muted-foreground' : ''}`}
                >
                  {isExpandedSub
                    ? formatColumnLabel({
                        key: col.key.split('::')[2],
                        label: col.key.split('::')[2],
                        cell_type: 'monthly',
                      })
                    : formatColumnLabel(col)}
                </span>
              )}
            </TableHead>
          );
        })}
      </TableRow>
    );
  }

  function renderRow(row: MixedGridRow) {
    return (
      <TableRow key={`${row.category}-${row.sub_category}`}>
        <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span>{nameMap[row.sub_category] ?? row.sub_category}</span>
            {row.capex_opex && (
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 h-3.5 ${
                  row.capex_opex === 'capex'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                    : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                }`}
              >
                {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
              </Badge>
            )}
          </div>
        </TableCell>
        {visibleColumns.map((col, idx) => {
          const yearStart = idx === 0 || columnYear(col) !== columnYear(visibleColumns[idx - 1]);
          const boundary = isBoundaryColumn(col, idx);
          const isQuarterly = col.cell_type === 'quarterly' && !col.key.includes('::expanded::');
          const isExpandedSub = col.key.includes('::expanded::');
          const display = getDisplayCell(row, col);
          const delta = lookupDelta(row.category, row.sub_category, display.lookupKey);
          const hasChange = isMeaningfulDelta(delta);
          return (
            <TableCell
              key={`${row.sub_category}-${col.key}`}
              className={`text-right text-xs ${
                yearStart ? 'border-l-2 border-border' : ''
              } ${
                boundary ? 'border-l-4 border-l-blue-400 dark:border-l-blue-500' : ''
              } ${isQuarterly ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''} ${
                isExpandedSub ? 'bg-blue-50/10 dark:bg-blue-900/5' : ''
              } ${
                hasChange
                  ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300/40 dark:ring-amber-600/30'
                  : ''
              }`}
            >
              {display.amount === 0 && display.hours === 0 ? (
                <span className="text-muted-foreground/40">&mdash;</span>
              ) : (
                <div className="flex flex-col items-end">
                  <span className="font-tabular font-medium inline-flex items-center">
                    {display.provisional && renderProvisionalDot()}
                    {row.category === 'internal'
                      ? `${formatNumber(display.hours)}h`
                      : formatCurrencyCompact(display.amount)}
                  </span>
                  {row.category === 'internal' && (
                    <span className="text-[10px] text-muted-foreground font-tabular">
                      {formatCurrencyCompact(display.amount)}
                    </span>
                  )}
                  {hasChange && renderDeltaIndicatorHelper(delta?.delta ?? null)}
                </div>
              )}
            </TableCell>
          );
        })}
      </TableRow>
    );
  }

  function renderSubtotalRow(label: string, targetRows: MixedGridRow[], style: 'subtotal' | 'grand') {
    const bgClass =
      style === 'grand'
        ? 'bg-muted border-t-2 border-border'
        : 'bg-muted/50 border-t border-border';
    const labelClass =
      style === 'grand'
        ? 'font-bold text-sm text-foreground'
        : 'font-semibold text-xs text-muted-foreground';
    const valueClass = style === 'grand' ? 'font-bold text-sm' : 'font-semibold text-xs';

    return (
      <TableRow className={bgClass}>
        <TableCell
          className={`sticky left-0 z-10 ${
            style === 'grand' ? 'bg-muted' : 'bg-muted/50'
          } border-r border-border whitespace-nowrap ${labelClass}`}
        >
          {label}
        </TableCell>
        {visibleColumns.map((col, idx) => {
          const yearStart = idx === 0 || columnYear(col) !== columnYear(visibleColumns[idx - 1]);
          const boundary = isBoundaryColumn(col, idx);
          const isQuarterly = col.cell_type === 'quarterly' && !col.key.includes('::expanded::');
          const total = targetRows.reduce((sum, row) => {
            const cell = getDisplayCell(row, col);
            return sum + cell.amount;
          }, 0);
          return (
            <TableCell
              key={`tot-${col.key}`}
              className={`text-right ${yearStart ? 'border-l-2 border-border' : ''} ${
                boundary ? 'border-l-4 border-l-blue-400 dark:border-l-blue-500' : ''
              } ${isQuarterly ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
            >
              <span className={`font-tabular ${valueClass}`}>
                {total === 0 ? (
                  <span className="text-muted-foreground/40">&mdash;</span>
                ) : (
                  formatCurrencyCompact(total)
                )}
              </span>
            </TableCell>
          );
        })}
      </TableRow>
    );
  }

  return (
    <div className="space-y-2 min-w-0">
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
                Quarterly columns can be expanded
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">
                Click a quarter header (e.g. "Q2") to reveal its three constituent
                months. Per [C-FG-03] the quarterly aggregate is distributed equally.
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() =>
            setExpandedQuarters((prev) => {
              if (prev.size > 0) return new Set();
              return new Set(grid.columns.filter((c) => c.cell_type === 'quarterly').map((c) => c.key));
            })
          }
        >
          {expandedQuarters.size > 0 ? 'Collapse all quarters' : 'Expand all quarters'}
        </Button>
      </div>
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            {renderHeaderRow1()}
            {renderHeaderRow2()}
          </TableHeader>
          <TableBody>
            {renderSubtotalRow('Grand Total', grid.rows, 'grand')}

            {internalRows.length > 0 && (
              <>
                <TableRow className="bg-muted/30">
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
                  >
                    Internal Resources (Hours / EUR)
                  </TableCell>
                </TableRow>
                {internalRows.map(renderRow)}
                {renderSubtotalRow('Subtotal Internal', internalRows, 'subtotal')}
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
                {externalRows.map(renderRow)}
                {renderSubtotalRow('Subtotal External', externalRows, 'subtotal')}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
