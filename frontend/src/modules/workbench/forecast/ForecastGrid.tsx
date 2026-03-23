import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { formatMonthShort, isElapsedMonth } from '@/lib/yearColumns';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import type { VisibleColumn } from '@/hooks/useCollapsibleYears';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow, ForecastMonthCell } from '@/types/api';

interface Props {
  projectId: string;
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

export function ForecastGrid({ projectId }: Props) {
  const [rows, setRows] = useState<ForecastGridRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(allMonths);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No forecast data available.</p>;
  }

  const internalRows = rows.filter((r) => r.category === 'internal');
  const externalRows = rows.filter((r) => r.category === 'external');

  function renderYearHeaders() {
    return (
      <TableRow className="bg-slate-50">
        <TableHead className="sticky left-0 bg-slate-50 min-w-[180px] z-10" rowSpan={2}>
          Line Item
        </TableHead>
        {yearGroups.map((g) => (
          <TableHead
            key={g.year}
            colSpan={g.isExpanded ? g.months.length : 1}
            className="text-center cursor-pointer select-none border-l-2 border-slate-300"
            onClick={() => toggleYear(g.year)}
          >
            <span className="text-[#1e40af] font-semibold">
              {g.isExpanded ? '\u25BE' : '\u25B8'} {g.year}
            </span>
          </TableHead>
        ))}
      </TableRow>
    );
  }

  function renderMonthHeaders() {
    return (
      <TableRow className="bg-slate-50">
        {visibleColumns.map((col) => {
          if (col.type === 'yearSummary') {
            return (
              <TableHead key={`sum-${col.year}`} className="text-right min-w-[90px] text-xs text-slate-400 border-l-2 border-slate-300">
                Total
              </TableHead>
            );
          }
          const elapsed = isElapsedMonth(col.key);
          return (
            <TableHead
              key={col.key}
              className={`text-right min-w-[100px] ${col.isJanuary ? 'border-l-2 border-slate-300 font-semibold' : ''} ${elapsed ? 'bg-[#fafafa]' : ''}`}
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
        <TableCell key={`sum-${col.year}`} className="text-right border-l-2 border-slate-300">
          <div>
            <span className="font-tabular font-medium">
              {formatNumber(totalHours)}h / {formatCurrency(totalEur)}
            </span>
            <span className="block text-[10px] text-slate-400 font-tabular">
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
        className={`text-right ${col.isJanuary ? 'border-l-2 border-slate-300' : ''} ${elapsed ? 'bg-[#fafafa]' : ''}`}
      >
        {cell ? (
          <div>
            <span className="font-tabular font-medium">
              {formatNumber(cell.forecast_hours)}h / {formatCurrency(cell.forecast_amount)}
            </span>
            <span className="block text-[10px] text-slate-400 font-tabular">
              BL: {formatNumber(cell.baseline_hours)}h
            </span>
            {cell.actuals_hours > 0 && (
              <span className="block text-[10px] text-slate-400 font-tabular">
                Act: {formatNumber(cell.actuals_hours)}h / {formatCurrency(cell.actuals_amount)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300">&mdash;</span>
        )}
      </TableCell>
    );
  }

  function renderExternalCell(row: ForecastGridRow, col: VisibleColumn) {
    if (col.type === 'yearSummary') {
      const total = sumCells(row, col.months, 'forecast_amount');
      const blTotal = sumCells(row, col.months, 'baseline_amount');
      return (
        <TableCell key={`sum-${col.year}`} className="text-right border-l-2 border-slate-300">
          <div>
            <span className="font-tabular font-medium">{formatCurrency(total)}</span>
            <span className="block text-[10px] text-slate-400 font-tabular">
              BL: {formatCurrency(blTotal)}
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
        className={`text-right ${col.isJanuary ? 'border-l-2 border-slate-300' : ''} ${elapsed ? 'bg-[#fafafa]' : ''}`}
      >
        {cell ? (
          <div>
            <span className="font-tabular font-medium">
              {formatCurrency(cell.forecast_amount)}
            </span>
            <span className="block text-[10px] text-slate-400 font-tabular">
              BL: {formatCurrency(cell.baseline_amount)}
            </span>
            {cell.actuals_amount > 0 && (
              <span className="block text-[10px] text-slate-400 font-tabular">
                Act: {formatCurrency(cell.actuals_amount)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300">&mdash;</span>
        )}
      </TableCell>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          {renderYearHeaders()}
          {renderMonthHeaders()}
        </TableHeader>
        <TableBody>
          {/* Internal Resources group */}
          {internalRows.length > 0 && (
            <>
              <TableRow className="bg-slate-50/50">
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                >
                  Internal Resources (Hours / EUR)
                </TableCell>
              </TableRow>
              {internalRows.map((row) => (
                <TableRow key={`${row.category}-${row.sub_category}`}>
                  <TableCell className="sticky left-0 bg-white font-medium text-sm z-10">
                    <div className="flex items-center gap-1.5">
                      {row.sub_category_name}
                      {row.capex_opex && (
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${row.capex_opex === 'capex' ? 'text-blue-600 border-blue-200' : 'text-amber-600 border-amber-200'}`}>
                          {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.map((col) => renderInternalCell(row, col))}
                </TableRow>
              ))}
            </>
          )}

          {/* External Costs group */}
          {externalRows.length > 0 && (
            <>
              <TableRow className="bg-slate-50/50">
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                >
                  External Costs (EUR)
                </TableCell>
              </TableRow>
              {externalRows.map((row) => (
                <TableRow key={`${row.category}-${row.sub_category}`}>
                  <TableCell className="sticky left-0 bg-white font-medium text-sm z-10">
                    <div className="flex items-center gap-1.5">
                      {row.sub_category_name}
                      {row.capex_opex && (
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${row.capex_opex === 'capex' ? 'text-blue-600 border-blue-200' : 'text-amber-600 border-amber-200'}`}>
                          {row.capex_opex === 'capex' ? 'CapEx' : 'OpEx'}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.map((col) => renderExternalCell(row, col))}
                </TableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
