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
import { Fragment, useEffect, useMemo, useState, useCallback, type RefObject } from 'react';
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
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import { DEMO_DATE, isElapsedMonth } from '@/lib/yearColumns';
import { milestonesApi, workbenchApi } from '@/api/endpoints';
import {
  lookupDelta as lookupDeltaHelper,
  isMeaningfulDelta,
} from '@/modules/simulator/lib/cellDiffHelpers';
import { useCollapsibleMixedYears } from '@/hooks/useCollapsibleYears';
import { useLegendStyle } from '@/hooks/useLegendStyle';
import { ForecastCell, type CellTemporalContext } from './ForecastCell';
import { ForecastGridLegend } from './ForecastGridLegend';
import { PhaseStrip, type PhaseStripColumn } from './PhaseStrip';
import { mapColumnsToPhases, withAlpha, type PhaseInfo } from './phaseHelpers';
import type { MilestoneResponse } from '@/types/milestones';
import type {
  CellDelta,
  MixedGridCell,
  MixedGridColumn,
  MixedGridResponse,
  MixedGridRow,
  MixedGridSubRow,
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
  /**
   * v5.1 W3 [C-04] — lockstep scroll seam. When provided the parent attaches
   * the same ref to the comparison-chart scroll wrapper so horizontal scroll
   * stays synchronised between the F&P grid and the C-04 chart below it.
   * Defaults to undefined (no-op) so existing call sites are unaffected.
   */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
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

/**
 * Internal column descriptor for rendering. `data` columns wrap a
 * `MixedGridColumn` (monthly, quarterly, or synthesised expanded sub-month);
 * `yearTotal` columns are emitted when a year is collapsed and aggregate
 * the year's underlying canonical cells (one synthetic column per year).
 *
 * Only `data` columns flow through `<ForecastCell>` so that component's prop
 * surface stays untouched (Wave 2 file-ownership rule).
 */
type DisplayColumn =
  | { kind: 'data'; col: MixedGridColumn; isYearStart: boolean; year: number }
  | { kind: 'yearTotal'; year: number; keys: string[] };

function isJanuaryColumnKey(key: string): boolean {
  // Year-boundary visual treatment: monthly January or quarterly Q1.
  if (key.length < 7) return false;
  const tail = key.slice(5);
  return tail === '01' || tail === 'Q1';
}

export function MixedGranularityGrid({
  projectId,
  nameMap,
  deltaIndex,
  comparisonActive,
  scenarioVersion,
  scrollContainerRef,
}: Props) {
  const [grid, setGrid] = useState<MixedGridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set());
  // v5.1 W4 — per-row expand state for C-05 (employees under internal roles)
  // and C-06 (vendor sub-rows under external categories). Key shape mirrors
  // the existing lookupDelta keying: `${category}|${sub_category}`.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // v5.1 C-09 follow-up — A/B legend style toggle (chips vs dots).
  const { style: legendStyle, toggle: toggleLegendStyle } = useLegendStyle();
  // v5.1 C-03 — milestone phase highlighting. Loaded async, with silent
  // degradation: if the fetch fails or returns nothing, the strip simply
  // doesn't render and per-column tints aren't applied.
  const [milestones, setMilestones] = useState<MilestoneResponse[]>([]);

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

  // v5.1 C-03 — load milestones for phase highlighting. Failures are silent:
  // we leave `milestones` as the empty array so the strip + tinting fall back
  // to the no-milestone behaviour (graceful degradation per spec).
  useEffect(() => {
    let cancelled = false;
    milestonesApi
      .list(projectId)
      .then((res) => {
        if (cancelled) return;
        setMilestones(res.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMilestones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggleQuarter = useCallback((qKey: string) => {
    setExpandedQuarters((prev) => {
      const next = new Set(prev);
      if (next.has(qKey)) next.delete(qKey);
      else next.add(qKey);
      return next;
    });
  }, []);

  // v5.1 W4 — chevron toggle for per-row expansion. Same pattern as
  // toggleQuarter but the key is the parent row identity. Memoised so the
  // chevron button doesn't re-render on every grid state change.
  const toggleRow = useCallback((category: string, sub: string) => {
    const key = `${category}|${sub}`;
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Year groups for column headers (full canonical column set)
  const yearGroups = useMemo(
    () => (grid ? groupColumnsByYear(grid.columns) : []),
    [grid],
  );

  // C-02: collapsible year columns. Default-expand the demo current year
  // (2026); every other year starts collapsed. The hook works on the
  // canonical column key list — quarter-expansion is layered on afterwards
  // so collapsed years swallow any quarter-expansion state.
  const canonicalKeys = useMemo(
    () => (grid ? grid.columns.map((c) => c.key) : []),
    [grid],
  );
  const {
    yearGroups: collapseGroups,
    toggleYear,
    visibleColumns: collapsedColumns,
  } = useCollapsibleMixedYears(canonicalKeys);

  // Map year → isExpanded for quick lookup in headers.
  const yearExpandedMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const g of collapseGroups) m.set(g.year, g.isExpanded);
    return m;
  }, [collapseGroups]);

  // Lookup canonical column by key.
  const colByKey = useMemo(() => {
    const m = new Map<string, MixedGridColumn>();
    if (grid) for (const c of grid.columns) m.set(c.key, c);
    return m;
  }, [grid]);

  // Build the actual render-time column list. For each entry coming out of
  // the year-collapse hook, expand quarters that the user opened, and emit
  // synthetic yearTotal columns for collapsed years.
  // Quarter expansion is a UI-only refinement per [C-FG-02]; the backend
  // always returns quarterly aggregates in the mixed-granularity response,
  // so when a quarter is expanded we synthesise monthly placeholders for
  // the three constituent months. The amount is the equal division of the
  // quarterly aggregate per [C-FG-03].
  const displayColumns = useMemo<DisplayColumn[]>(() => {
    if (!grid) return [];
    const out: DisplayColumn[] = [];
    for (const entry of collapsedColumns) {
      if (entry.type === 'yearSummary') {
        out.push({ kind: 'yearTotal', year: entry.year, keys: entry.keys });
        continue;
      }
      const col = colByKey.get(entry.key);
      if (!col) continue;
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
          const subCol: MixedGridColumn = {
            key: `${col.key}::expanded::${mStr}`,
            label: mStr,
            cell_type: 'monthly',
          };
          out.push({
            kind: 'data',
            col: subCol,
            isYearStart: false,
            year,
          });
        }
      }
      out.push({
        kind: 'data',
        col,
        isYearStart: entry.isYearStart,
        year: entry.year,
      });
    }
    return out;
  }, [grid, collapsedColumns, expandedQuarters, colByKey]);

  // v5.1 C-03 — phase map keyed by display-column key. Quarter-expanded
  // sub-cells share their parent quarter's range so the tint reads cleanly
  // even when the user expands a quarter that straddles a phase boundary.
  // yearTotal columns are intentionally excluded (no key passed in).
  const phaseMap = useMemo<Map<string, PhaseInfo>>(() => {
    if (milestones.length === 0) return new Map();
    const dataKeys: string[] = [];
    for (const entry of displayColumns) {
      if (entry.kind === 'data') dataKeys.push(entry.col.key);
    }
    return mapColumnsToPhases(dataKeys, milestones);
  }, [milestones, displayColumns]);

  // Strip-row column descriptor list: data entries carry the column key,
  // yearTotal entries supply `null` so the strip breaks segments at year
  // boundaries.
  const phaseStripColumns = useMemo<PhaseStripColumn[]>(() => {
    return displayColumns.map((entry) =>
      entry.kind === 'data'
        ? { key: entry.col.key, kind: 'data' as const }
        : { key: null, kind: 'yearTotal' as const },
    );
  }, [displayColumns]);

  // Identify the boundary column index — last monthly column among the
  // *canonical* columns. Used for the zone-boundary divider; the divider
  // sits at the first quarterly column whose previous canonical column is
  // monthly. Resolved against `displayColumns` at render time.
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

  function findSubCell(sub: MixedGridSubRow, key: string): MixedGridCell | undefined {
    return sub.cells.find((c) => c.key === key);
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

  interface DisplayCell {
    hours: number;
    amount: number;
    provisional: boolean;
    lookupKey: string;
    // v5.1 C-08 overlays + temporal context
    baselineHours: number | null;
    baselineAmount: number | null;
    actualsHours: number | null;
    actualsAmount: number | null;
    actualsPartial: boolean | null;
    temporalContext: CellTemporalContext;
  }

  function getDisplayCellFromCells(
    cells: MixedGridCell[],
    col: MixedGridColumn,
  ): DisplayCell {
    if (col.key.includes('::expanded::')) {
      const [parentQuarter, , month] = col.key.split('::');
      const parentCell = cells.find((c) => c.key === parentQuarter);
      const constituent = quarterMonths(parentQuarter);
      const n = constituent.length;
      const div = (v: number | null | undefined) =>
        v === null || v === undefined ? null : Math.round((v / n) * 100) / 100;
      const hours = parentCell ? parentCell.hours / n : 0;
      const amount = parentCell ? parentCell.amount_eur / n : 0;
      return {
        hours: Math.round(hours * 100) / 100,
        amount: Math.round(amount * 100) / 100,
        provisional: parentCell?.is_provisional ?? false,
        lookupKey: month,
        baselineHours: div(parentCell?.baseline_hours),
        baselineAmount: div(parentCell?.baseline_amount_eur),
        actualsHours: div(parentCell?.actuals_hours),
        actualsAmount: div(parentCell?.actuals_amount_eur),
        actualsPartial: parentCell?.actuals_partial ?? null,
        temporalContext: classifyTemporalContext(month),
      };
    }
    const cell = cells.find((c) => c.key === col.key);
    return {
      hours: cell?.hours ?? 0,
      amount: cell?.amount_eur ?? 0,
      provisional: cell?.is_provisional ?? false,
      lookupKey: col.key,
      baselineHours: cell?.baseline_hours ?? null,
      baselineAmount: cell?.baseline_amount_eur ?? null,
      actualsHours: cell?.actuals_hours ?? null,
      actualsAmount: cell?.actuals_amount_eur ?? null,
      actualsPartial: cell?.actuals_partial ?? null,
      temporalContext: classifyTemporalContext(col.key, cell?.actuals_partial ?? null),
    };
  }

  function getDisplayCell(row: MixedGridRow, col: MixedGridColumn): DisplayCell {
    return getDisplayCellFromCells(row.cells, col);
  }

  /**
   * Map a cell key to its temporal context relative to the demo date.
   *
   * - Monthly key strictly < demo date → past
   * - Monthly key === demo date OR cell flagged actuals_partial → current
   * - Otherwise → future
   *
   * Quarterly keys ('YYYY-QN'): if the backend marked the cell partial it
   * means the demo month is one of the constituents → current. If the entire
   * quarter is in the past (last constituent month < demo date) → past.
   * Anything else → future.
   */
  function classifyTemporalContext(
    key: string,
    actualsPartial: boolean | null = null,
  ): CellTemporalContext {
    if (actualsPartial) return 'current';
    if (key.length === 7 && key[5] === 'Q') {
      // Quarterly: derive last constituent month for past detection
      const year = parseInt(key.slice(0, 4), 10);
      const qNum = parseInt(key.slice(6), 10);
      const lastMonthNum = qNum * 3;
      const lastMonth = `${year}-${String(lastMonthNum).padStart(2, '0')}`;
      if (isElapsedMonth(lastMonth)) return 'past';
      return 'future';
    }
    if (isElapsedMonth(key)) return 'past';
    if (key === DEMO_DATE) return 'current';
    return 'future';
  }

  function isBoundaryColumn(col: MixedGridColumn, idx: number): boolean {
    // True if the column to the LEFT of this one is the last monthly column
    // in the original (unexpanded) sequence. That means this column starts
    // the quarterly zone.
    if (lastMonthlyIdx < 0) return false;
    if (idx === 0) return false;
    if (col.cell_type !== 'quarterly') return false;
    // Boundary divider at the first quarterly column whose previous data
    // column is monthly (i.e., crossing the zone boundary). Skip backwards
    // past any yearTotal columns, which never count for boundary detection.
    let prevIdx = idx - 1;
    while (prevIdx >= 0 && displayColumns[prevIdx]?.kind !== 'data') prevIdx -= 1;
    if (prevIdx < 0) return false;
    const prevEntry = displayColumns[prevIdx];
    if (prevEntry.kind !== 'data') return false;
    return prevEntry.col.cell_type === 'monthly';
  }

  /**
   * Sum hours + EUR across an array of canonical column keys for a row.
   * Used to render yearly-summary cells when a year is collapsed.
   */
  function sumRowAcrossKeys(row: MixedGridRow, keys: string[]): { hours: number; amount: number; provisional: boolean } {
    let hours = 0;
    let amount = 0;
    let provisional = false;
    for (const k of keys) {
      const cell = findCell(row, k);
      if (!cell) continue;
      hours += cell.hours;
      amount += cell.amount_eur;
      if (cell.is_provisional) provisional = true;
    }
    return { hours, amount, provisional };
  }

  // colSpan for each year group's header cell — counts every entry in
  // displayColumns whose year matches, including expanded sub-months under
  // quarterly cols. Collapsed years contribute exactly one column
  // (the yearTotal cell).
  function colSpanForYear(year: number): number {
    let n = 0;
    for (const entry of displayColumns) {
      if (entry.kind === 'data' && entry.year === year) n += 1;
      else if (entry.kind === 'yearTotal' && entry.year === year) n += 1;
    }
    return n;
  }

  /**
   * v5.1 C-03 — render a `<colgroup>` with one `<col>` per visible column
   * (line-item label first, then every displayColumn entry). Tinted columns
   * carry an inline `backgroundColor` derived from the milestone palette at
   * very low alpha (~7%) so the phase context reads across every data row
   * without overwhelming the foreground. Cells that already paint their own
   * background (boundary blue, hasChange amber, isQuarterly blue, sticky
   * left labels) will mask this tint where they apply — which is the
   * intended behaviour: phase tint is the lowest visual layer.
   *
   * We use `<col>` here (rather than per-cell inline styles) so the tint
   * spans every body row uniformly, including subtotal rows, without
   * touching ForecastCell — preserving Wave 2's strict file-ownership rule.
   */
  function renderColGroup() {
    if (phaseMap.size === 0) return null;
    return (
      <colgroup>
        {/* Line-item label column — never tinted. */}
        <col />
        {displayColumns.map((entry, idx) => {
          if (entry.kind === 'yearTotal') {
            return <col key={`col-yt-${entry.year}-${idx}`} />;
          }
          const phase = phaseMap.get(entry.col.key);
          if (!phase) return <col key={`col-${entry.col.key}`} />;
          const tint = withAlpha(phase.color, 0.07);
          return (
            <col
              key={`col-${entry.col.key}`}
              style={{ backgroundColor: tint }}
            />
          );
        })}
      </colgroup>
    );
  }

  function renderHeaderRow1() {
    return (
      <TableRow className="bg-muted/50">
        <TableHead
          className="sticky left-0 top-0 bg-muted/50 z-30 border-r border-border whitespace-nowrap min-w-[220px]"
          rowSpan={2}
        >
          Line item
        </TableHead>
        {yearGroups.map((g) => {
          const isExpanded = yearExpandedMap.get(g.year) ?? false;
          const span = colSpanForYear(g.year);
          if (span === 0) return null;
          return (
            <TableHead
              key={`yr-${g.year}`}
              colSpan={span}
              className="sticky top-0 z-20 bg-muted/50 text-center border-l-2 border-border text-xs font-semibold"
            >
              <button
                type="button"
                onClick={() => toggleYear(g.year)}
                aria-expanded={isExpanded}
                className="inline-flex items-center gap-1 cursor-pointer text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>{g.year}</span>
                {isExpanded && g.hasMonthly && g.hasQuarterly && (
                  <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                    · monthly + quarterly
                  </span>
                )}
              </button>
            </TableHead>
          );
        })}
      </TableRow>
    );
  }

  function renderHeaderRow2() {
    return (
      <TableRow className="bg-muted/30">
        {displayColumns.map((entry, idx) => {
          if (entry.kind === 'yearTotal') {
            return (
              <TableHead
                key={`col-yt-${entry.year}`}
                className="sticky top-10 z-20 bg-muted/40 dark:bg-muted/40 text-right min-w-[110px] text-xs border-l-4 border-foreground/30 dark:border-foreground/40 font-bold text-foreground"
              >
                <span className="font-tabular">{entry.year} Total</span>
              </TableHead>
            );
          }
          const col = entry.col;
          const isQuarterly = col.cell_type === 'quarterly';
          const expandable = isQuarterly && !col.key.includes('::expanded::');
          const isExpanded = expandable && expandedQuarters.has(col.key);
          const isExpandedSub = col.key.includes('::expanded::');
          const isJanColumn = !isExpandedSub && isJanuaryColumnKey(col.key);
          const isYearStart = entry.isYearStart;
          const boundary = isBoundaryColumn(col, idx);
          return (
            <TableHead
              key={`col-${col.key}`}
              className={`sticky top-10 z-20 bg-muted/30 text-right min-w-[90px] text-xs ${
                isYearStart || isJanColumn
                  ? 'border-l-4 border-foreground/30 dark:border-foreground/40'
                  : ''
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
                  <span
                    className={`font-tabular font-semibold ${
                      isJanColumn ? 'text-foreground' : ''
                    }`}
                  >
                    {formatColumnLabel(col)}
                  </span>
                </button>
              ) : (
                <span
                  className={`font-tabular ${
                    isQuarterly ? 'font-semibold' : ''
                  } ${isExpandedSub ? 'text-muted-foreground' : ''} ${
                    isJanColumn ? 'font-bold text-foreground' : ''
                  }`}
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
    // v5.1 W4 — chevron toggle for per-employee / per-vendor sub-rows.
    const rowKey = `${row.category}|${row.sub_category}`;
    const hasSubRows = !!row.sub_rows && row.sub_rows.length > 0;
    const isExpanded = expandedRows.has(rowKey);
    // v5.1 C-07 — when external row carries a single derived role, the
    // grid label shows `[Category] — [Role]`. Mixed-role rows fall back
    // to the bare category label per spec answer.
    const baseLabel = nameMap[row.sub_category] ?? row.sub_category;
    const displayLabel =
      row.category === 'external' && row.role_name
        ? `${baseLabel} — ${row.role_name}`
        : baseLabel;
    return (
      <TableRow key={`${row.category}-${row.sub_category}`}>
        <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {hasSubRows ? (
              <button
                type="button"
                onClick={() => toggleRow(row.category, row.sub_category)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                aria-expanded={isExpanded}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <span className="inline-block w-3.5" aria-hidden />
            )}
            <span>{displayLabel}</span>
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
        {displayColumns.map((entry, idx) => {
          if (entry.kind === 'yearTotal') {
            const totals = sumRowAcrossKeys(row, entry.keys);
            const empty = totals.amount === 0 && totals.hours === 0;
            return (
              <TableCell
                key={`${row.sub_category}-yt-${entry.year}`}
                className="text-right text-xs border-l-4 border-foreground/30 dark:border-foreground/40 bg-muted/20 dark:bg-muted/20 font-semibold"
              >
                {empty ? (
                  <span className="text-muted-foreground/40">&mdash;</span>
                ) : (
                  <div className="flex flex-col items-end">
                    <span className="font-tabular">
                      {row.category === 'internal'
                        ? `${formatNumber(totals.hours)}h`
                        : formatCurrencyCompact(totals.amount)}
                    </span>
                    {row.category === 'internal' && (
                      <span className="text-[10px] text-muted-foreground font-tabular">
                        {formatCurrencyCompact(totals.amount)}
                      </span>
                    )}
                  </div>
                )}
              </TableCell>
            );
          }
          const col = entry.col;
          const isJanColumn = !col.key.includes('::expanded::') && isJanuaryColumnKey(col.key);
          const yearStart = entry.isYearStart || isJanColumn;
          const boundary = isBoundaryColumn(col, idx);
          const isQuarterly = col.cell_type === 'quarterly' && !col.key.includes('::expanded::');
          const isExpandedSub = col.key.includes('::expanded::');
          const display = getDisplayCell(row, col);
          const delta = lookupDelta(row.category, row.sub_category, display.lookupKey);
          const hasChange = isMeaningfulDelta(delta);
          return (
            <ForecastCell
              key={`${row.sub_category}-${col.key}`}
              category={row.category}
              display={{
                hours: display.hours,
                amount: display.amount,
                provisional: display.provisional,
                baselineHours: display.baselineHours,
                baselineAmount: display.baselineAmount,
                actualsHours: display.actualsHours,
                actualsAmount: display.actualsAmount,
                actualsPartial: display.actualsPartial,
              }}
              delta={delta}
              hasChange={hasChange}
              yearStart={yearStart}
              boundary={boundary}
              isQuarterly={isQuarterly}
              isExpandedSub={isExpandedSub}
              temporalContext={display.temporalContext}
            />
          );
        })}
      </TableRow>
    );
  }

  /**
   * v5.1 W4 — render one sub-row under an expanded parent row. Inherits the
   * parent's category for cell formatting (internal → hours/EUR, external →
   * EUR only). Year-totals computed by summing the sub-row's own cells.
   */
  function renderSubRow(parent: MixedGridRow, sub: MixedGridSubRow, idx: number) {
    return (
      <TableRow
        key={`${parent.category}-${parent.sub_category}-sub-${idx}`}
        className="bg-muted/30"
      >
        <TableCell className="sticky left-0 bg-muted text-xs z-10 border-r border-border whitespace-nowrap pl-8">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{sub.label}</span>
            {sub.sub_label && (
              <span className="text-[10px] text-muted-foreground">{sub.sub_label}</span>
            )}
          </div>
        </TableCell>
        {displayColumns.map((entry, cidx) => {
          if (entry.kind === 'yearTotal') {
            const totals = sumCellsAcrossKeys(sub.cells, entry.keys);
            const empty = totals.amount === 0 && totals.hours === 0;
            return (
              <TableCell
                key={`${parent.sub_category}-sub-${idx}-yt-${entry.year}`}
                className="text-right text-[11px] border-l-4 border-foreground/30 dark:border-foreground/40 bg-muted/20 dark:bg-muted/30"
              >
                {empty ? (
                  <span className="text-muted-foreground/40">&mdash;</span>
                ) : (
                  <div className="flex flex-col items-end">
                    <span className="font-tabular">
                      {parent.category === 'internal'
                        ? `${formatNumber(totals.hours)}h`
                        : formatCurrencyCompact(totals.amount)}
                    </span>
                    {parent.category === 'internal' && (
                      <span className="text-[9px] text-muted-foreground font-tabular">
                        {formatCurrencyCompact(totals.amount)}
                      </span>
                    )}
                  </div>
                )}
              </TableCell>
            );
          }
          const col = entry.col;
          const isJanColumn = !col.key.includes('::expanded::') && isJanuaryColumnKey(col.key);
          const yearStart = entry.isYearStart || isJanColumn;
          const boundary = isBoundaryColumn(col, cidx);
          const isQuarterly = col.cell_type === 'quarterly' && !col.key.includes('::expanded::');
          const isExpandedSub = col.key.includes('::expanded::');
          const display = getDisplayCellFromCells(sub.cells, col);
          // Sub-rows do not participate in comparison overlays — the
          // canonical cell-delta keys are at the parent (category, sub) level.
          return (
            <ForecastCell
              key={`${parent.sub_category}-sub-${idx}-${col.key}`}
              category={parent.category}
              display={{
                hours: display.hours,
                amount: display.amount,
                provisional: display.provisional,
                baselineHours: display.baselineHours,
                baselineAmount: display.baselineAmount,
                actualsHours: display.actualsHours,
                actualsAmount: display.actualsAmount,
                actualsPartial: display.actualsPartial,
              }}
              delta={undefined}
              hasChange={false}
              yearStart={yearStart}
              boundary={boundary}
              isQuarterly={isQuarterly}
              isExpandedSub={isExpandedSub}
              temporalContext={display.temporalContext}
            />
          );
        })}
      </TableRow>
    );
  }

  function sumCellsAcrossKeys(
    cells: MixedGridCell[],
    keys: string[],
  ): { hours: number; amount: number } {
    let hours = 0;
    let amount = 0;
    for (const k of keys) {
      const c = cells.find((x) => x.key === k);
      if (c) {
        hours += c.hours;
        amount += c.amount_eur;
      }
    }
    return { hours: Math.round(hours * 100) / 100, amount: Math.round(amount * 100) / 100 };
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
        {displayColumns.map((entry, idx) => {
          if (entry.kind === 'yearTotal') {
            const total = targetRows.reduce((sum, row) => {
              return sum + sumRowAcrossKeys(row, entry.keys).amount;
            }, 0);
            return (
              <TableCell
                key={`tot-yt-${entry.year}`}
                className="text-right border-l-4 border-foreground/30 dark:border-foreground/40 bg-muted/30 dark:bg-muted/30"
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
          }
          const col = entry.col;
          const isJanColumn = !col.key.includes('::expanded::') && isJanuaryColumnKey(col.key);
          const yearStart = entry.isYearStart || isJanColumn;
          const boundary = isBoundaryColumn(col, idx);
          const isQuarterly = col.cell_type === 'quarterly' && !col.key.includes('::expanded::');
          const total = targetRows.reduce((sum, row) => {
            const cell = getDisplayCell(row, col);
            return sum + cell.amount;
          }, 0);
          return (
            <TableCell
              key={`tot-${col.key}`}
              className={`text-right ${
                yearStart ? 'border-l-4 border-foreground/30 dark:border-foreground/40' : ''
              } ${
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

  const handleToggleAllQuarters = () => {
    setExpandedQuarters((prev) => {
      if (prev.size > 0) return new Set();
      return new Set(
        grid.columns.filter((c) => c.cell_type === 'quarterly').map((c) => c.key),
      );
    });
  };

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={toggleLegendStyle}
          title="Switch legend style (A/B compare)"
        >
          Legend: {legendStyle === 'chips' ? 'sample chips ⇄ dots' : 'dots ⇄ sample chips'}
        </Button>
      </div>
      <ForecastGridLegend
        style={legendStyle}
        granularityBoundaryMonths={grid.granularity_boundary_months}
        horizonEndMonth={grid.horizon_end_month}
        expandedQuartersCount={expandedQuarters.size}
        onToggleAllQuarters={handleToggleAllQuarters}
      />
      {/* C-02: viewport-bound scroll container with sticky header + sticky left column.
          max-h is the F&P grid budget; horizontal scroll engages when content exceeds width.
          v5.1 W3 [C-04] — lockstep scroll seam: when a parent supplies
          `scrollContainerRef` we attach it here so the comparison-chart
          scroll wrapper below the grid can be kept in sync. */}
      <div
        ref={scrollContainerRef}
        className="border border-border rounded-lg overflow-auto max-h-[calc(100vh-260px)]"
      >
        <Table>
          {renderColGroup()}
          <TableHeader>
            {renderHeaderRow1()}
            {renderHeaderRow2()}
            <PhaseStrip columns={phaseStripColumns} milestones={milestones} />
          </TableHeader>
          <TableBody>
            {renderSubtotalRow('Grand Total', grid.rows, 'grand')}

            {internalRows.length > 0 && (
              <>
                <TableRow className="bg-muted/30">
                  <TableCell
                    colSpan={displayColumns.length + 1}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
                  >
                    Internal Resources (Hours / EUR)
                  </TableCell>
                </TableRow>
                {internalRows.map((row) => {
                  const rowKey = `${row.category}|${row.sub_category}`;
                  const expanded = expandedRows.has(rowKey);
                  return (
                    <Fragment key={rowKey}>
                      {renderRow(row)}
                      {expanded && row.sub_rows?.map((sub, i) => renderSubRow(row, sub, i))}
                    </Fragment>
                  );
                })}
                {renderSubtotalRow('Subtotal Internal', internalRows, 'subtotal')}
              </>
            )}

            {externalRows.length > 0 && (
              <>
                <TableRow className="bg-muted/30">
                  <TableCell
                    colSpan={displayColumns.length + 1}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
                  >
                    External Costs (EUR)
                  </TableCell>
                </TableRow>
                {externalRows.map((row) => {
                  const rowKey = `${row.category}|${row.sub_category}`;
                  const expanded = expandedRows.has(rowKey);
                  return (
                    <Fragment key={rowKey}>
                      {renderRow(row)}
                      {expanded && row.sub_rows?.map((sub, i) => renderSubRow(row, sub, i))}
                    </Fragment>
                  );
                })}
                {renderSubtotalRow('Subtotal External', externalRows, 'subtotal')}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
