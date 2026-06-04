/**
 * MonthCategoryGrid — shared month-by-category editing grid.
 *
 * Pure presentational primitive. The consumer owns:
 *  - data loading
 *  - working-change tracking (e.g. forecast ChangeSets, baseline buffers)
 *  - persistence (Save buttons / dirty buffers / autosave)
 *
 * The grid itself only renders:
 *  - a sticky-left line-item column
 *  - one column per month (or quarter) supplied
 *  - optional group section dividers (e.g. "Internal Resources (Hours)")
 *  - click-to-edit cells that emit `onCellChange(row, col, newValue)` on blur/Enter
 *  - optional provisional-dot markers, isChanged / isSuggested styling
 *  - optional quarter-expansion (caller decides whether to expose this)
 *
 * Both the Workbench Phase 3 forecast grid and the Define Financials baseline
 * grid consume this primitive; they differ only in what `getCellState` returns
 * and what `onCellChange` does on the data side.
 */
import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { cn } from '@/lib/utils';
import {
  formatCurrency,
  formatCurrencyDetailed,
  formatNumber,
} from '@/lib/formatters';
import { formatMonthShort } from '@/lib/yearColumns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonthCategoryGridCellType = 'monthly' | 'quarterly';

export interface MonthCategoryGridRow {
  category: string;                   // 'internal' | 'external' | custom
  sub_category: string;               // unique id within category
  sub_category_name: string;          // display label
  capex_opex?: string | null;         // optional CapEx/OpEx pill
  hourly_rate?: number | null;        // internal rows: € rate for display
  /**
   * Optional workforce-location city for internal rows split per location
   * (S6 location-aware rates). When present it renders a qualified location
   * chip beside the role name so same-role-multi-location splits are
   * distinguishable. Null/absent for external and location-less rows.
   */
  location_name?: string | null;
}

export interface MonthCategoryGridColumn {
  key: string;                         // 'YYYY-MM' or 'YYYY-QN'
  /** Optional override label. When omitted, the grid derives one from `key`. */
  label?: string;
  cell_type: MonthCategoryGridCellType;
}

/**
 * State for a single cell. The consumer computes this from its own model.
 * Internal-category rows are displayed in HOURS (with a derived EUR sub-line);
 * other categories are displayed in EUR. Quarterly cells should aggregate the
 * three months they represent — the grid does not aggregate for you.
 */
export interface MonthCategoryGridCellState {
  /** Number of hours (internal) or EUR (everything else) to display. */
  displayValue: number;
  /** True if any constituent month has been edited from its original value. */
  isChanged?: boolean;
  /** True if the change was applied via a backend suggestion (workbench-only). */
  isSuggested?: boolean;
  /** True if any constituent month carries the `is_provisional` flag (workbench-only). */
  isProvisional?: boolean;
  /** False to render as read-only (e.g. past months in workbench). */
  canEdit: boolean;
  /** True if there is no monthly data underneath (renders an em dash). */
  isEmpty?: boolean;
}

export interface MonthCategoryGridGroup {
  /** Matches `row.category`. */
  key: string;
  /** Section header label, e.g. "Internal Resources (Hours)". */
  label: string;
}

export interface MonthCategoryGridQuarterExpansion {
  expanded: Set<string>;
  onToggle: (quarterKey: string) => void;
}

export interface MonthCategoryGridProps {
  rows: MonthCategoryGridRow[];
  columns: MonthCategoryGridColumn[];
  /** Returns the cell state for a (row, column) pair. */
  getCellState: (
    row: MonthCategoryGridRow,
    col: MonthCategoryGridColumn,
  ) => MonthCategoryGridCellState;
  /** Called when the user commits an edit on a cell (blur / Enter). */
  onCellChange: (
    row: MonthCategoryGridRow,
    col: MonthCategoryGridColumn,
    newValue: number,
  ) => void;
  /** Optional section dividers — one per unique category in `rows`. */
  groups?: MonthCategoryGridGroup[];
  /** If provided, quarterly columns become expandable. */
  quarterExpansion?: MonthCategoryGridQuarterExpansion;
  /** Render in read-only mode regardless of per-cell `canEdit`. */
  readOnly?: boolean;
  /** Optional emptyState slot when no rows are provided. */
  emptyState?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function columnYear(col: MonthCategoryGridColumn): number {
  return parseInt(col.key.slice(0, 4), 10);
}

function defaultColumnLabel(col: MonthCategoryGridColumn): string {
  if (col.key.includes('::expanded::')) {
    return formatMonthShort(col.key.split('::')[2]);
  }
  if (col.cell_type === 'monthly') {
    const month = col.key;
    return `${formatMonthShort(month)} ${month.slice(2, 4)}`;
  }
  // 'YYYY-QN' → 'QN'
  return col.key.slice(5);
}

function isExpandedSubKey(key: string): boolean {
  return key.includes('::expanded::');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthCategoryGrid({
  rows,
  columns,
  getCellState,
  onCellChange,
  groups,
  quarterExpansion,
  readOnly = false,
  emptyState,
}: MonthCategoryGridProps) {
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);

  // Year grouping for the header row.
  const yearGroups = useMemo(() => {
    const map = new Map<number, number>();
    for (const col of columns) {
      const y = columnYear(col);
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }, [columns]);

  // Identify the last monthly column; the first quarterly column after it gets
  // the blue boundary border.
  const boundaryFromIdx = useMemo(() => {
    let lastMonthly = -1;
    columns.forEach((c, i) => {
      if (c.cell_type === 'monthly' && !isExpandedSubKey(c.key)) lastMonthly = i;
    });
    if (lastMonthly < 0 || lastMonthly >= columns.length - 1) return -1;
    // First quarterly column right after the last monthly
    for (let i = lastMonthly + 1; i < columns.length; i += 1) {
      if (columns[i].cell_type === 'quarterly' && !isExpandedSubKey(columns[i].key)) return i;
    }
    return -1;
  }, [columns]);

  const grouped = useMemo(() => {
    if (!groups || groups.length === 0) {
      return [{ key: '__all__', label: null as string | null, rows }];
    }
    return groups.map((g) => ({
      key: g.key,
      label: g.label,
      rows: rows.filter((r) => r.category === g.key),
    }));
  }, [rows, groups]);

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  function commitEdit(
    row: MonthCategoryGridRow,
    col: MonthCategoryGridColumn,
    raw: string,
  ) {
    const v = parseFloat(raw);
    if (!Number.isNaN(v) && v >= 0) {
      onCellChange(row, col, v);
    }
    setEditingCellKey(null);
  }

  function renderCell(row: MonthCategoryGridRow, col: MonthCategoryGridColumn) {
    const isInternal = row.category === 'internal';
    const state = getCellState(row, col);
    const cellKey = `${row.category}:${row.sub_category}:${col.key}`;
    const isEditing = editingCellKey === cellKey;
    const editable = !readOnly && state.canEdit && !state.isEmpty;

    if (isEditing && editable) {
      return (
        <Input
          type="number"
          step="any"
          className="h-7 w-24 text-right text-sm p-1"
          defaultValue={state.displayValue}
          autoFocus
          onBlur={(e) => commitEdit(row, col, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitEdit(row, col, (e.target as HTMLInputElement).value);
            }
            if (e.key === 'Escape') setEditingCellKey(null);
          }}
        />
      );
    }

    if (state.isEmpty) {
      return <span className="text-muted-foreground/40">—</span>;
    }

    const rate = isInternal ? row.hourly_rate ?? 0 : 0;
    const eurValue = isInternal ? state.displayValue * rate : state.displayValue;
    const valueLabel = isInternal
      ? `${formatNumber(state.displayValue)} hrs`
      : formatCurrency(state.displayValue);

    if (!editable) {
      return (
        <div className="bg-muted/50 rounded px-1.5 py-0.5 inline-block min-w-[60px]">
          <span className="text-sm text-muted-foreground inline-flex items-center">
            {state.isProvisional && <ProvisionalDot />}
            {valueLabel}
          </span>
        </div>
      );
    }

    return (
      <div>
        <button
          type="button"
          className={cn(
            'text-sm font-medium cursor-pointer px-1.5 py-0.5 rounded transition-colors w-full text-right',
            state.isSuggested && 'bg-primary/5 text-primary',
            state.isChanged &&
              !state.isSuggested &&
              'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
            !state.isChanged && 'hover:bg-accent',
          )}
          onClick={() => setEditingCellKey(cellKey)}
        >
          <span className="inline-flex items-center justify-end gap-1">
            {state.isProvisional && <ProvisionalDot />}
            {valueLabel}
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

  return (
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
            {columns.map((col, idx) => {
              const isQuarterly = col.cell_type === 'quarterly';
              const expandedSub = isExpandedSubKey(col.key);
              const expandable =
                quarterExpansion && isQuarterly && !expandedSub;
              const isExpanded =
                expandable && quarterExpansion!.expanded.has(col.key);
              const yearStart =
                idx === 0 || columnYear(col) !== columnYear(columns[idx - 1]);
              const isBoundary = idx === boundaryFromIdx;

              return (
                <TableHead
                  key={`col-${col.key}`}
                  className={cn(
                    'text-right min-w-[90px] text-xs',
                    yearStart && 'border-l-2 border-border',
                    isBoundary &&
                      'border-l-4 border-l-blue-400 dark:border-l-blue-500 bg-blue-50/40 dark:bg-blue-900/20',
                    isQuarterly &&
                      !expandedSub &&
                      'bg-blue-50/40 dark:bg-blue-900/20',
                    expandedSub && 'bg-blue-50/20 dark:bg-blue-900/10 italic',
                  )}
                >
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => quarterExpansion!.onToggle(col.key)}
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span className="font-tabular font-semibold">
                        {col.label ?? defaultColumnLabel(col)}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={cn(
                        'font-tabular',
                        isQuarterly && 'font-semibold',
                        expandedSub && 'text-muted-foreground',
                      )}
                    >
                      {col.label ?? defaultColumnLabel(col)}
                    </span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map((section) => (
            <SectionRows
              key={section.key}
              label={section.label}
              rows={section.rows}
              columns={columns}
              renderCell={renderCell}
              boundaryFromIdx={boundaryFromIdx}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

interface SectionRowsProps {
  label: string | null;
  rows: MonthCategoryGridRow[];
  columns: MonthCategoryGridColumn[];
  renderCell: (
    row: MonthCategoryGridRow,
    col: MonthCategoryGridColumn,
  ) => React.ReactNode;
  boundaryFromIdx: number;
}

function SectionRows({
  label,
  rows,
  columns,
  renderCell,
  boundaryFromIdx,
}: SectionRowsProps) {
  if (rows.length === 0) return null;
  return (
    <>
      {label && (
        <TableRow className="bg-muted/30">
          <TableCell
            colSpan={columns.length + 1}
            className="font-medium text-xs text-muted-foreground uppercase tracking-wide"
          >
            {label}
          </TableCell>
        </TableRow>
      )}
      {rows.map((row) => (
        <TableRow key={`${row.category}-${row.sub_category}`}>
          <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
            <div className="flex items-center gap-1.5">
              <span>{row.sub_category_name}</span>
              {row.location_name && (
                <LocationLabel
                  kind="workforce"
                  text={row.location_name}
                  className="text-[11px] font-normal text-muted-foreground"
                />
              )}
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
          {columns.map((col, idx) => {
            const yearStart =
              idx === 0 || columnYear(col) !== columnYear(columns[idx - 1]);
            const isQuarterly =
              col.cell_type === 'quarterly' && !isExpandedSubKey(col.key);
            const isBoundary = idx === boundaryFromIdx;
            return (
              <TableCell
                key={`${row.sub_category}-${col.key}`}
                className={cn(
                  'p-1',
                  yearStart && 'border-l-2 border-border',
                  isBoundary &&
                    'border-l-4 border-l-blue-400 dark:border-l-blue-500',
                  isQuarterly && 'bg-blue-50/30 dark:bg-blue-900/10',
                  isExpandedSubKey(col.key) &&
                    'bg-blue-50/10 dark:bg-blue-900/5',
                )}
              >
                {renderCell(row, col)}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

function ProvisionalDot() {
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
