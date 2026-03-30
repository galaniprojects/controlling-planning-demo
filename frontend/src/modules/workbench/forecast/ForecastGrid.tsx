import React, { useState, useEffect, useCallback } from 'react';
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
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import { formatMonthShort, isElapsedMonth } from '@/lib/yearColumns';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import type { VisibleColumn } from '@/hooks/useCollapsibleYears';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow, ForecastMonthCell, PersonAssignment } from '@/types/api';

interface Props {
  projectId: string;
  defaultExpandedYear?: number;
}

function findCell(row: ForecastGridRow, month: string): ForecastMonthCell | undefined {
  return row.months.find((c) => c.month === month);
}

function sumCells(
  row: ForecastGridRow,
  months: string[],
  field: 'forecast_hours' | 'forecast_amount' | 'baseline_hours' | 'baseline_amount' | 'actuals_hours' | 'actuals_amount',
): number {
  let total = 0;
  for (const m of months) {
    const cell = findCell(row, m);
    if (cell) total += cell[field];
  }
  return total;
}

export function ForecastGrid({ projectId, defaultExpandedYear }: Props) {
  const [rows, setRows] = useState<ForecastGridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const toggleRole = useCallback((subCategory: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(subCategory)) next.delete(subCategory);
      else next.add(subCategory);
      return next;
    });
  }, []);

  const hasAnyAssignments = rows.some(
    (r) => r.category === 'internal' && r.assignments && r.assignments.length > 0,
  );

  const expandableRoleIds = rows
    .filter((r) => r.category === 'internal' && r.assignments && r.assignments.length > 0)
    .map((r) => r.sub_category);

  const allExpanded = expandableRoleIds.length > 0 && expandableRoleIds.every((id) => expandedRoles.has(id));

  const toggleAll = useCallback(() => {
    setExpandedRoles((prev) => {
      if (expandableRoleIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(expandableRoleIds);
    });
  }, [expandableRoleIds]);

  useEffect(() => {
    setLoading(true);
    workbenchApi
      .getForecast(projectId)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Collect all unique months
  const allMonths = Array.from(
    new Set(rows.flatMap((r) => r.months.map((m) => m.month))),
  ).sort();

  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(allMonths, defaultExpandedYear);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No forecast data available.</p>;
  }

  const internalRows = rows.filter((r) => r.category === 'internal');
  const externalRows = rows.filter((r) => r.category === 'external');

  // Column totals helper: sum a field across a set of rows for a given month
  function sumColumnMonth(
    targetRows: ForecastGridRow[],
    month: string,
    field: 'forecast_amount' | 'baseline_amount' | 'actuals_amount',
  ): number {
    let total = 0;
    for (const row of targetRows) {
      const cell = findCell(row, month);
      if (cell) total += cell[field];
    }
    return total;
  }

  function sumColumnMonths(
    targetRows: ForecastGridRow[],
    months: string[],
    field: 'forecast_amount' | 'baseline_amount' | 'actuals_amount',
  ): number {
    let total = 0;
    for (const m of months) total += sumColumnMonth(targetRows, m, field);
    return total;
  }

  function findPersonHours(assignment: PersonAssignment, month: string): number {
    const m = assignment.months.find((e) => e.month === month);
    return m ? m.hours : 0;
  }

  function sumPersonHours(assignment: PersonAssignment, months: string[]): number {
    let total = 0;
    for (const m of months) total += findPersonHours(assignment, m);
    return total;
  }

  function renderAssignmentRow(assignment: PersonAssignment) {
    return (
      <TableRow key={`assign-${assignment.person_id}`} className="bg-muted/20">
        <TableCell className="sticky left-0 bg-muted/20 z-10 border-r border-border whitespace-nowrap pl-8 text-xs text-muted-foreground">
          {assignment.person_name}
        </TableCell>
        {visibleColumns.map((col) => {
          if (col.type === 'yearSummary') {
            const total = sumPersonHours(assignment, col.months);
            return (
              <TableCell key={`pa-ys-${col.year}`} className="text-right border-l-2 border-border text-xs text-muted-foreground font-tabular">
                {total > 0 ? `${formatNumber(total)}h` : <span className="text-muted-foreground/40">&mdash;</span>}
              </TableCell>
            );
          }
          const hours = findPersonHours(assignment, col.key);
          const elapsed = isElapsedMonth(col.key);
          return (
            <TableCell
              key={`pa-${col.key}`}
              className={`text-right text-xs text-muted-foreground font-tabular ${col.isJanuary ? 'border-l-2 border-border' : ''} ${elapsed ? 'bg-muted/20' : ''}`}
            >
              {hours > 0 ? `${formatNumber(hours)}h` : <span className="text-muted-foreground/40">&mdash;</span>}
            </TableCell>
          );
        })}
      </TableRow>
    );
  }

  function renderTotalRow(
    label: string,
    targetRows: ForecastGridRow[],
    style: 'subtotal' | 'grand',
  ) {
    const bgClass = style === 'grand'
      ? 'bg-muted border-t-2 border-border'
      : 'bg-muted/50 border-t border-border';
    const labelClass = style === 'grand'
      ? 'font-bold text-sm text-foreground'
      : 'font-semibold text-xs text-muted-foreground';
    const valueClass = style === 'grand'
      ? 'font-bold text-sm'
      : 'font-semibold text-xs';

    return (
      <TableRow className={bgClass}>
        <TableCell className={`sticky left-0 z-10 ${style === 'grand' ? 'bg-muted' : 'bg-muted/50'} border-r border-border whitespace-nowrap ${labelClass}`}>
          {label}
        </TableCell>
        {visibleColumns.map((col) => {
          if (col.type === 'yearSummary') {
            const fc = sumColumnMonths(targetRows, col.months, 'forecast_amount');
            const bl = sumColumnMonths(targetRows, col.months, 'baseline_amount');
            return (
              <TableCell key={`tot-ys-${col.year}`} className="text-right border-l-2 border-border">
                <div>
                  <span className={`font-tabular ${valueClass}`}>{formatCurrencyCompact(fc)}</span>
                  <span className="block text-[10px] text-muted-foreground font-tabular">BL: {formatCurrencyCompact(bl)}</span>
                </div>
              </TableCell>
            );
          }
          const month = col.key;
          const elapsed = isElapsedMonth(month);
          const fc = sumColumnMonth(targetRows, month, 'forecast_amount');
          const bl = sumColumnMonth(targetRows, month, 'baseline_amount');
          const act = sumColumnMonth(targetRows, month, 'actuals_amount');
          return (
            <TableCell
              key={`tot-${month}`}
              className={`text-right ${col.isJanuary ? 'border-l-2 border-border' : ''} ${elapsed ? 'bg-muted/20' : ''}`}
            >
              <div>
                <span className={`font-tabular ${valueClass}`}>{formatCurrencyCompact(fc)}</span>
                <span className="block text-[10px] text-muted-foreground font-tabular">BL: {formatCurrencyCompact(bl)}</span>
                {act > 0 && (
                  <span className="block text-[10px] text-muted-foreground font-tabular">Act: {formatCurrencyCompact(act)}</span>
                )}
              </div>
            </TableCell>
          );
        })}
      </TableRow>
    );
  }

  function renderYearHeaders() {
    return (
      <TableRow className="bg-muted/50">
        <TableHead className="sticky left-0 bg-muted/50 z-10 border-r border-border whitespace-nowrap" rowSpan={2}>
          Line Item
        </TableHead>
        {yearGroups.map((g) => (
          <TableHead
            key={g.year}
            colSpan={g.isExpanded ? g.months.length : 1}
            className="text-center cursor-pointer select-none border-l-2 border-border"
            onClick={() => toggleYear(g.year)}
          >
            <span className="text-primary font-semibold">
              {g.isExpanded ? '\u25BE' : '\u25B8'} {g.year}
            </span>
          </TableHead>
        ))}
      </TableRow>
    );
  }

  function renderMonthHeaders() {
    return (
      <TableRow className="bg-muted/50">
        {visibleColumns.map((col) => {
          if (col.type === 'yearSummary') {
            return (
              <TableHead key={`sum-${col.year}`} className="text-right min-w-[90px] text-xs text-muted-foreground border-l-2 border-border">
                Total
              </TableHead>
            );
          }
          const elapsed = isElapsedMonth(col.key);
          return (
            <TableHead
              key={col.key}
              className={`text-right min-w-[100px] ${col.isJanuary ? 'border-l-2 border-border font-semibold' : ''} ${elapsed ? 'bg-muted/20' : ''}`}
            >
              {formatMonthShort(col.key)}
            </TableHead>
          );
        })}
      </TableRow>
    );
  }

  function renderInternalCell(row: ForecastGridRow, col: VisibleColumn) {
    if (col.type === 'yearSummary') {
      const totalHours = sumCells(row, col.months, 'forecast_hours');
      const blTotalHours = sumCells(row, col.months, 'baseline_hours');
      const totalEur = sumCells(row, col.months, 'forecast_amount');
      return (
        <TableCell key={`sum-${col.year}`} className="text-right border-l-2 border-border">
          <div>
            <span className="font-tabular font-medium">
              {formatNumber(totalHours)}h / {formatCurrencyCompact(totalEur)}
            </span>
            <span className="block text-[10px] text-muted-foreground font-tabular">
              BL: {formatNumber(blTotalHours)}h
            </span>
          </div>
        </TableCell>
      );
    }
    const cell = findCell(row, col.key);
    const elapsed = isElapsedMonth(col.key);
    return (
      <TableCell
        key={col.key}
        className={`text-right ${col.isJanuary ? 'border-l-2 border-border' : ''} ${elapsed ? 'bg-muted/20' : ''}`}
      >
        {cell ? (
          <div>
            <span className="font-tabular font-medium">
              {formatNumber(cell.forecast_hours)}h / {formatCurrencyCompact(cell.forecast_amount)}
            </span>
            <span className="block text-[10px] text-muted-foreground font-tabular">
              BL: {formatNumber(cell.baseline_hours)}h
            </span>
            {cell.actuals_hours > 0 && (
              <span className="block text-[10px] text-muted-foreground font-tabular">
                Act: {formatNumber(cell.actuals_hours)}h / {formatCurrencyCompact(cell.actuals_amount)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/40">&mdash;</span>
        )}
      </TableCell>
    );
  }

  function renderExternalCell(row: ForecastGridRow, col: VisibleColumn) {
    if (col.type === 'yearSummary') {
      const total = sumCells(row, col.months, 'forecast_amount');
      const blTotal = sumCells(row, col.months, 'baseline_amount');
      return (
        <TableCell key={`sum-${col.year}`} className="text-right border-l-2 border-border">
          <div>
            <span className="font-tabular font-medium">{formatCurrencyCompact(total)}</span>
            <span className="block text-[10px] text-muted-foreground font-tabular">
              BL: {formatCurrencyCompact(blTotal)}
            </span>
          </div>
        </TableCell>
      );
    }
    const cell = findCell(row, col.key);
    const elapsed = isElapsedMonth(col.key);
    return (
      <TableCell
        key={col.key}
        className={`text-right ${col.isJanuary ? 'border-l-2 border-border' : ''} ${elapsed ? 'bg-muted/20' : ''}`}
      >
        {cell ? (
          <div>
            <span className="font-tabular font-medium">
              {formatCurrencyCompact(cell.forecast_amount)}
            </span>
            <span className="block text-[10px] text-muted-foreground font-tabular">
              BL: {formatCurrencyCompact(cell.baseline_amount)}
            </span>
            {cell.actuals_amount > 0 && (
              <span className="block text-[10px] text-muted-foreground font-tabular">
                Act: {formatCurrencyCompact(cell.actuals_amount)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/40">&mdash;</span>
        )}
      </TableCell>
    );
  }

  return (
    <div className="space-y-2">
      {hasAnyAssignments && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1"
            onClick={toggleAll}
          >
            {allExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Users className="h-3.5 w-3.5" />
            {allExpanded ? 'Collapse All Resources' : 'Expand All Resources'}
          </Button>
        </div>
      )}
    <div className="border border-border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          {renderYearHeaders()}
          {renderMonthHeaders()}
        </TableHeader>
        <TableBody>
          {/* Grand Total at top */}
          {renderTotalRow('Grand Total', rows, 'grand')}

          {/* Internal Resources group */}
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
              {internalRows.map((row) => {
                const hasAssignments = row.assignments && row.assignments.length > 0;
                const isExpanded = expandedRoles.has(row.sub_category);
                return (
                  <React.Fragment key={`${row.category}-${row.sub_category}`}>
                    <TableRow>
                      <TableCell className="sticky left-0 bg-card font-medium text-sm z-10 border-r border-border whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {hasAssignments ? (
                            <button
                              type="button"
                              className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                              onClick={() => toggleRole(row.sub_category)}
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              {row.sub_category_name}
                            </button>
                          ) : (
                            <span>{row.sub_category_name}</span>
                          )}
                          {row.capex_opex && (
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${row.capex_opex === 'capex' ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
                              {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {visibleColumns.map((col) => renderInternalCell(row, col))}
                    </TableRow>
                    {isExpanded && row.assignments?.map((a) => renderAssignmentRow(a))}
                  </React.Fragment>
                );
              })}
              {renderTotalRow('Subtotal Internal', internalRows, 'subtotal')}
            </>
          )}

          {/* External Costs group */}
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
                      {row.sub_category_name}
                      {row.capex_opex && (
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${row.capex_opex === 'capex' ? 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' : 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
                          {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.map((col) => renderExternalCell(row, col))}
                </TableRow>
              ))}
              {renderTotalRow('Subtotal External', externalRows, 'subtotal')}
            </>
          )}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
