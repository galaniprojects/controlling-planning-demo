import { useMemo } from 'react';
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
  ColumnMeta,
  ConditionalFormatRule,
  DimensionItem,
  MeasureItem,
} from '@/types/reportBuilder';

interface ResultsTableProps {
  results: ReportExecuteResponse;
  isStale: boolean;
  formatRules: ConditionalFormatRule[];
  rowDims: DimensionItem[];
  measures: MeasureItem[];
}

function formatCell(value: string | number | null | undefined, col: ColumnMeta): string {
  if (value === null || value === undefined || value === '') return '—';
  if (col.type === 'dimension') return String(value);

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  switch (col.format) {
    case 'currency':
      return formatCurrencyDetailed(num);
    case 'percent':
      return formatPercent(num);
    case 'hours':
      return `${formatNumber(num)} h`;
    case 'number':
      return formatNumber(num);
    default:
      return formatNumber(num);
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
      case '<': match = value < rule.value; break;
      case '<=': match = value <= rule.value; break;
      case '>': match = value > rule.value; break;
      case '>=': match = value >= rule.value; break;
      case '=': match = Math.abs(value - rule.value) < 0.001; break;
      case 'between': match = rule.value2 !== undefined && value >= rule.value && value <= rule.value2; break;
    }
    if (match) color = rule.color;
  }
  return color;
}

export function ResultsTable({ results, isStale, formatRules, rowDims, measures }: ResultsTableProps) {
  if (results.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No data found for the selected combination.</p>
        <p className="text-xs mt-1">Try adjusting your filters or adding different dimensions.</p>
      </div>
    );
  }

  const dimCols = results.columns.filter((c) => c.type === 'dimension');
  const measureCols = results.columns.filter((c) => c.type === 'measure');

  // Group by first row dim for subtotals
  const outerDimId = rowDims.length > 0 ? rowDims[0].id : null;
  const showSubtotals = outerDimId !== null && rowDims.length > 1;

  // Compute grouped rows and subtotals
  const grouped = useMemo(() => {
    if (!showSubtotals || !outerDimId) return null;
    const groups: { key: string; rows: Record<string, string | number>[]; subtotals: Record<string, number> }[] = [];
    const groupMap = new Map<string, Record<string, string | number>[]>();
    const order: string[] = [];

    for (const row of results.rows) {
      const key = String(row[outerDimId] ?? '');
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        order.push(key);
      }
      groupMap.get(key)!.push(row);
    }

    for (const key of order) {
      const rows = groupMap.get(key)!;
      const subtotals: Record<string, number> = {};
      for (const col of measureCols) {
        let sum = 0;
        for (const row of rows) {
          const val = row[col.id];
          if (typeof val === 'number') sum += val;
        }
        subtotals[col.id] = sum;
      }
      groups.push({ key, rows, subtotals });
    }
    return groups;
  }, [results.rows, outerDimId, showSubtotals, measureCols]);

  // Grand totals
  const grandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const col of measureCols) {
      let sum = 0;
      for (const row of results.rows) {
        const val = row[col.id];
        if (typeof val === 'number') sum += val;
      }
      totals[col.id] = sum;
    }
    return totals;
  }, [results.rows, measureCols]);

  const renderRow = (row: Record<string, string | number>, idx: number) => (
    <TableRow key={idx} className="hover:bg-accent/30">
      {dimCols.map((col) => (
        <TableCell key={col.id} className="text-xs whitespace-nowrap py-1.5">
          {formatCell(row[col.id], col)}
        </TableCell>
      ))}
      {measureCols.map((col) => {
        const val = row[col.id];
        const numVal = typeof val === 'number' ? val : null;
        const bgColor = getCellColor(numVal, col.id, formatRules);
        return (
          <TableCell
            key={col.id}
            className="text-xs whitespace-nowrap text-right font-mono py-1.5"
            style={bgColor ? { backgroundColor: bgColor } : undefined}
          >
            {formatCell(val, col)}
          </TableCell>
        );
      })}
    </TableRow>
  );

  return (
    <div className={`relative ${isStale ? 'opacity-50' : ''}`}>
      {isStale && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span className="bg-background/90 border border-border rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Results are stale — click Run Report to refresh
          </span>
        </div>
      )}
      <div className="overflow-auto max-h-full border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {dimCols.map((col) => (
                <TableHead
                  key={col.id}
                  className="text-xs font-semibold whitespace-nowrap sticky top-0 bg-muted/50 z-10"
                >
                  {col.name}
                </TableHead>
              ))}
              {measureCols.map((col) => (
                <TableHead
                  key={col.id}
                  className="text-xs font-semibold whitespace-nowrap text-right sticky top-0 bg-muted/50 z-10"
                >
                  {col.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped
              ? grouped.map((group) => (
                  <GroupRows
                    key={group.key}
                    group={group}
                    dimCols={dimCols}
                    measureCols={measureCols}
                    formatRules={formatRules}
                    renderRow={renderRow}
                  />
                ))
              : results.rows.map((row, idx) => renderRow(row, idx))}

            {/* Grand total */}
            {results.rows.length > 1 && (
              <TableRow className="bg-muted/40 font-semibold border-t-2 border-border">
                <TableCell
                  colSpan={dimCols.length}
                  className="text-xs whitespace-nowrap py-1.5 font-semibold"
                >
                  Grand Total
                </TableCell>
                {measureCols.map((col) => (
                  <TableCell
                    key={col.id}
                    className="text-xs whitespace-nowrap text-right font-mono py-1.5 font-semibold"
                  >
                    {formatCell(grandTotals[col.id], col)}
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

/* ── Group Rows for subtotals ── */

interface GroupRowsProps {
  group: { key: string; rows: Record<string, string | number>[]; subtotals: Record<string, number> };
  dimCols: ColumnMeta[];
  measureCols: ColumnMeta[];
  formatRules: ConditionalFormatRule[];
  renderRow: (row: Record<string, string | number>, idx: number) => React.ReactNode;
}

function GroupRows({ group, dimCols, measureCols, renderRow }: GroupRowsProps) {
  return (
    <>
      {group.rows.map((row, idx) => renderRow(row, idx))}
      <TableRow className="bg-muted/30 font-medium border-b border-border">
        <TableCell
          colSpan={dimCols.length}
          className="text-xs whitespace-nowrap py-1.5 font-medium italic"
        >
          {group.key} — Subtotal
        </TableCell>
        {measureCols.map((col) => (
          <TableCell
            key={col.id}
            className="text-xs whitespace-nowrap text-right font-mono py-1.5 font-medium"
          >
            {formatCell(group.subtotals[col.id], col)}
          </TableCell>
        ))}
      </TableRow>
    </>
  );
}
