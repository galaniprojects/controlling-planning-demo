/**
 * CrossTabTable — OLAP-style cross-tabulation renderer with nested headers,
 * collapse/expand, subtotals, grand totals, sticky positioning, and sorting.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrencyDetailed, formatNumber, formatPercent } from '@/lib/formatters';
import type {
  ReportExecuteResponse,
  DimensionItem,
  MeasureItem,
  CrossTabData,
  ColLeaf,
  RowGroup,
  RowEntry,
  ConditionalFormatRule,
} from '@/types/reportBuilder';
import { buildCrossTabData } from './crossTabTransform';

/* ── Props ── */

interface CrossTabTableProps {
  results: ReportExecuteResponse;
  rowDims: DimensionItem[];
  colDims: DimensionItem[];
  measures: MeasureItem[];
  isStale: boolean;
  formatRules: ConditionalFormatRule[];
}

/* ── Formatting helpers ── */

function formatValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':
      return formatCurrencyDetailed(value);
    case 'percent':
      return formatPercent(value);
    case 'hours':
      return `${formatNumber(value)} h`;
    case 'number':
      return formatNumber(value);
    default:
      return formatNumber(value);
  }
}

/** Evaluate conditional format rules for a cell — last match wins */
function getCellColor(
  value: number | null | undefined,
  measureId: string,
  rules: ConditionalFormatRule[],
): string | null {
  if (value === null || value === undefined) return null;
  const measureRules = rules.filter((r) => r.measureId === measureId);
  let color: string | null = null;
  for (const rule of measureRules) {
    let match = false;
    switch (rule.operator) {
      case '<':
        match = value < rule.value;
        break;
      case '<=':
        match = value <= rule.value;
        break;
      case '>':
        match = value > rule.value;
        break;
      case '>=':
        match = value >= rule.value;
        break;
      case '=':
        match = Math.abs(value - rule.value) < 0.001;
        break;
      case 'between':
        match = rule.value2 !== undefined && value >= rule.value && value <= rule.value2;
        break;
    }
    if (match) color = rule.color;
  }
  return color;
}

/* ── Sorting ── */

interface SortState {
  colKey: string | null;
  direction: 'asc' | 'desc';
}

function sortEntries(entries: RowEntry[], sort: SortState): RowEntry[] {
  if (!sort.colKey) return entries;
  const key = sort.colKey;
  return [...entries].sort((a, b) => {
    const va = a.cells[key] ?? 0;
    const vb = b.cells[key] ?? 0;
    return sort.direction === 'asc' ? va - vb : vb - va;
  });
}

/* ── Constants ── */

const ROW_DIM_COL_WIDTH = 160;
const HEADER_ROW_HEIGHT = 32;

/* ── Component ── */

export function CrossTabTable({
  results,
  rowDims,
  colDims,
  measures,
  isStale,
  formatRules,
}: CrossTabTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ colKey: null, direction: 'asc' });

  const crossTab = useMemo(
    () => buildCrossTabData(results, rowDims, colDims, measures),
    [results, rowDims, colDims, measures],
  );

  if (results.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No data found for the selected combination.</p>
        <p className="text-xs mt-1">Try adjusting your filters or adding different dimensions.</p>
      </div>
    );
  }

  const { headerLevels, colLeaves, rowGroups, grandTotals } = crossTab;
  const hasMultipleRowDims = rowDims.length > 1;
  const hasRowDims = rowDims.length > 0;
  const showGrouping = hasRowDims && rowGroups.length > 1;

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (colKey: string) => {
    setSort((prev) => {
      if (prev.colKey === colKey) {
        if (prev.direction === 'asc') return { colKey, direction: 'desc' };
        return { colKey: null, direction: 'asc' }; // reset
      }
      return { colKey, direction: 'asc' };
    });
  };

  // Number of sticky left columns (row dimensions)
  const numLeftCols = rowDims.length || 0;

  return (
    <div className={`relative ${isStale ? 'opacity-50' : ''}`}>
      {isStale && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <span className="bg-background/90 border border-border rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Results are stale — click Run Report to refresh
          </span>
        </div>
      )}

      <div className="overflow-auto border border-border rounded-md max-h-full">
        <Table>
          <TableHeader>
            {/* Column header levels */}
            {headerLevels.map((level, levelIdx) => (
              <TableRow key={levelIdx} className="bg-muted/50">
                {/* Row dim header cells (only on first header row) */}
                {levelIdx === 0 &&
                  rowDims.map((dim, dimIdx) => (
                    <TableHead
                      key={dim.id}
                      rowSpan={headerLevels.length}
                      className="text-xs font-semibold whitespace-nowrap bg-muted/50 border-r border-border"
                      style={{
                        position: 'sticky',
                        left: dimIdx * ROW_DIM_COL_WIDTH,
                        top: 0,
                        zIndex: 30,
                        minWidth: ROW_DIM_COL_WIDTH,
                      }}
                    >
                      {dim.display_name}
                    </TableHead>
                  ))}
                {/* Column header nodes */}
                {level.map((node, nodeIdx) => (
                  <TableHead
                    key={`${levelIdx}-${nodeIdx}`}
                    colSpan={node.span}
                    className={`text-xs font-semibold whitespace-nowrap text-center bg-muted/50 ${
                      node.span > 1 ? 'border-x border-border' : ''
                    } ${levelIdx === headerLevels.length - 1 ? 'cursor-pointer select-none hover:bg-muted/70' : ''}`}
                    style={{
                      position: 'sticky',
                      top: levelIdx * HEADER_ROW_HEIGHT,
                      zIndex: 20,
                    }}
                    onClick={
                      levelIdx === headerLevels.length - 1
                        ? () => {
                            // Find the corresponding colLeaf
                            let leafIdx = 0;
                            for (let i = 0; i < nodeIdx; i++) leafIdx++;
                            if (colLeaves[nodeIdx]) handleSort(colLeaves[nodeIdx].colKey);
                          }
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {node.label}
                      {levelIdx === headerLevels.length - 1 &&
                        colLeaves[nodeIdx] &&
                        sort.colKey === colLeaves[nodeIdx].colKey && (
                          sort.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rowGroups.map((group) => (
              <RowGroupRows
                key={group.key}
                group={group}
                rowDims={rowDims}
                colLeaves={colLeaves}
                isCollapsed={collapsed.has(group.key)}
                onToggle={() => toggleCollapse(group.key)}
                showGrouping={showGrouping}
                hasMultipleRowDims={hasMultipleRowDims}
                sort={sort}
                formatRules={formatRules}
              />
            ))}

            {/* Grand total row */}
            {rowGroups.length > 1 && (
              <TableRow className="bg-muted/40 font-semibold border-t-2 border-border">
                <TableCell
                  colSpan={numLeftCols || 1}
                  className="text-xs whitespace-nowrap py-1.5 font-semibold"
                  style={
                    numLeftCols > 0
                      ? { position: 'sticky', left: 0, zIndex: 10, background: 'inherit' }
                      : undefined
                  }
                >
                  Grand Total
                </TableCell>
                {colLeaves.map((leaf) => (
                  <TableCell
                    key={leaf.colKey}
                    className="text-xs whitespace-nowrap text-right font-mono py-1.5 font-semibold"
                  >
                    {formatValue(grandTotals[leaf.colKey], leaf.measureFormat)}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        {results.total_rows} row{results.total_rows !== 1 ? 's' : ''}
        {results.warnings.length > 0 && (
          <span className="ml-3 text-amber-600 dark:text-amber-400">
            {results.warnings.join(' | ')}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Row Group sub-component ── */

interface RowGroupRowsProps {
  group: RowGroup;
  rowDims: DimensionItem[];
  colLeaves: ColLeaf[];
  isCollapsed: boolean;
  onToggle: () => void;
  showGrouping: boolean;
  hasMultipleRowDims: boolean;
  sort: SortState;
  formatRules: ConditionalFormatRule[];
}

function RowGroupRows({
  group,
  rowDims,
  colLeaves,
  isCollapsed,
  onToggle,
  showGrouping,
  hasMultipleRowDims,
  sort,
  formatRules,
}: RowGroupRowsProps) {
  const sortedChildren = useMemo(
    () => sortEntries(group.children, sort),
    [group.children, sort],
  );

  // For single row dim or no grouping, render children directly (no subtotals)
  if (!showGrouping || !hasMultipleRowDims) {
    return (
      <>
        {sortedChildren.map((entry, idx) => (
          <DataRow
            key={idx}
            entry={entry}
            rowDims={rowDims}
            colLeaves={colLeaves}
            formatRules={formatRules}
          />
        ))}
      </>
    );
  }

  // Multiple row dims with collapsible grouping
  return (
    <>
      {/* Group header row */}
      <TableRow
        className="bg-muted/20 cursor-pointer hover:bg-muted/30"
        onClick={onToggle}
      >
        <TableCell
          className="text-xs font-semibold whitespace-nowrap py-1.5"
          style={{ position: 'sticky', left: 0, zIndex: 10, background: 'inherit' }}
        >
          <span className="inline-flex items-center gap-1">
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {group.label}
          </span>
        </TableCell>
        {/* Empty cells for remaining row dims */}
        {rowDims.slice(1).map((dim, dimIdx) => (
          <TableCell
            key={dim.id}
            className="text-xs whitespace-nowrap py-1.5"
            style={{
              position: 'sticky',
              left: (dimIdx + 1) * ROW_DIM_COL_WIDTH,
              zIndex: 10,
              background: 'inherit',
            }}
          />
        ))}
        {/* Subtotal values on group header */}
        {colLeaves.map((leaf) => (
          <TableCell
            key={leaf.colKey}
            className="text-xs whitespace-nowrap text-right font-mono py-1.5 font-semibold"
          >
            {formatValue(group.subtotals[leaf.colKey], leaf.measureFormat)}
          </TableCell>
        ))}
      </TableRow>

      {/* Detail rows (hidden when collapsed) */}
      {!isCollapsed &&
        sortedChildren.map((entry, idx) => (
          <DataRow
            key={idx}
            entry={entry}
            rowDims={rowDims}
            colLeaves={colLeaves}
            formatRules={formatRules}
            indent
          />
        ))}
    </>
  );
}

/* ── Data Row sub-component ── */

interface DataRowProps {
  entry: RowEntry;
  rowDims: DimensionItem[];
  colLeaves: ColLeaf[];
  formatRules: ConditionalFormatRule[];
  indent?: boolean;
}

function DataRow({ entry, rowDims, colLeaves, formatRules, indent }: DataRowProps) {
  return (
    <TableRow className="hover:bg-accent/30">
      {rowDims.map((dim, dimIdx) => {
        // When indented (multi-dim grouping), first dim is already in the group header
        const showValue = indent && dimIdx === 0 ? '' : (entry.dimValues[dim.id] ?? '—');
        return (
          <TableCell
            key={dim.id}
            className={`text-xs whitespace-nowrap py-1.5 ${
              indent && dimIdx === 0 ? 'pl-7' : ''
            }`}
            style={{
              position: 'sticky',
              left: dimIdx * ROW_DIM_COL_WIDTH,
              zIndex: 10,
              background: 'inherit',
            }}
          >
            {showValue}
          </TableCell>
        );
      })}
      {colLeaves.map((leaf) => {
        const val = entry.cells[leaf.colKey];
        const bgColor = getCellColor(val, leaf.measureId, formatRules);
        return (
          <TableCell
            key={leaf.colKey}
            className="text-xs whitespace-nowrap text-right font-mono py-1.5"
            style={bgColor ? { backgroundColor: bgColor } : undefined}
          >
            {formatValue(val, leaf.measureFormat)}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/* ── Subtotal Row sub-component ── */

interface SubtotalRowProps {
  label: string;
  subtotals: Record<string, number>;
  colLeaves: ColLeaf[];
  numLeftCols: number;
}

function SubtotalRow({ label, subtotals, colLeaves, numLeftCols }: SubtotalRowProps) {
  return (
    <TableRow className="bg-muted/30 font-medium border-b border-border">
      <TableCell
        colSpan={numLeftCols}
        className="text-xs whitespace-nowrap py-1.5 font-medium italic"
        style={{ position: 'sticky', left: 0, zIndex: 10, background: 'inherit' }}
      >
        {label} — Subtotal
      </TableCell>
      {colLeaves.map((leaf) => (
        <TableCell
          key={leaf.colKey}
          className="text-xs whitespace-nowrap text-right font-mono py-1.5 font-medium"
        >
          {formatValue(subtotals[leaf.colKey], leaf.measureFormat)}
        </TableCell>
      ))}
    </TableRow>
  );
}
