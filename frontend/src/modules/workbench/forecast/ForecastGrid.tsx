import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow, ForecastMonthCell } from '@/types/api';
import {
  ExternalCostStatusBadge,
  STATUS_SUMMARY_ORDER,
  getStatusLabel,
} from './ExternalCostStatusBadge';
import { useCollapsibleYears, type Column } from '@/hooks/useCollapsibleYears';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  projectId: string;
}

export function ForecastGrid({ projectId }: Props) {
  const [rows, setRows] = useState<ForecastGridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    setStatusFilter('all');
    workbenchApi
      .getForecast(projectId)
      .then((res) => setRows(res.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Collect all unique months
  const allMonths = useMemo(
    () =>
      Array.from(
        new Set(rows.flatMap((r) => r.months.map((m) => m.month))),
      ).sort(),
    [rows],
  );

  const { columns, expandedYears, toggleYear } = useCollapsibleYears({
    allMonths,
  });

  const internalRows = useMemo(
    () => rows.filter((r) => r.category === 'internal'),
    [rows],
  );
  const externalRows = useMemo(
    () => rows.filter((r) => r.category === 'external'),
    [rows],
  );

  // Compute status summary totals from all external rows
  const statusSummary = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of externalRows) {
      for (const cell of row.months) {
        const s = cell.ext_status;
        if (s) {
          totals[s] = (totals[s] || 0) + cell.forecast_amount;
        }
      }
    }
    return totals;
  }, [externalRows]);

  // Filter external rows by status — keep row if any of its months match
  const filteredExternalRows = useMemo(() => {
    if (statusFilter === 'all') return externalRows;
    return externalRows
      .map((row) => ({
        ...row,
        months: row.months.filter((m) => m.ext_status === statusFilter),
      }))
      .filter((row) => row.months.length > 0);
  }, [externalRows, statusFilter]);

  // Available statuses for filter dropdown
  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    for (const row of externalRows) {
      for (const cell of row.months) {
        if (cell.ext_status) statuses.add(cell.ext_status);
      }
    }
    return STATUS_SUMMARY_ORDER.filter((s) => statuses.has(s));
  }, [externalRows]);

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

  const colCount = columns.length + 1; // +1 for sticky label column

  return (
    <div className="space-y-3">
      {/* External cost status summary bar */}
      {externalRows.length > 0 && Object.keys(statusSummary).length > 0 && (
        <div className="flex flex-wrap gap-3 px-1">
          {STATUS_SUMMARY_ORDER.filter((s) => statusSummary[s]).map((s) => (
            <button
              key={s}
              onClick={() =>
                setStatusFilter(statusFilter === s ? 'all' : s)
              }
              className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1 border transition-colors ${
                statusFilter === s
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <ExternalCostStatusBadge status={s} />
              <span className="font-medium text-slate-700">
                {formatCurrency(statusSummary[s])}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto max-w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="sticky left-0 bg-slate-50 min-w-[180px] z-10">
                Line Item
              </TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-right min-w-[100px] ${col.type === 'year' ? 'cursor-pointer select-none hover:bg-slate-100' : ''}`}
                  onClick={col.type === 'year' ? () => toggleYear(col.year) : undefined}
                >
                  {col.type === 'month' ? (
                    formatMonth(col.month)
                  ) : (
                    <span className="flex items-center justify-end gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {col.year}
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Expanded year sub-headers (chevron to collapse) */}
            {/* Internal Resources group */}
            {internalRows.length > 0 && (
              <>
                <TableRow className="bg-slate-50/50">
                  <TableCell
                    colSpan={colCount}
                    className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                  >
                    Internal Resources (Hours)
                  </TableCell>
                </TableRow>
                {internalRows.map((row) => (
                  <TableRow key={row.sub_category}>
                    <TableCell className="sticky left-0 bg-white font-medium text-sm z-10">
                      {row.sub_category_name}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-right">
                        {col.type === 'month' ? (
                          <InternalMonthCell row={row} month={col.month} />
                        ) : (
                          <InternalYearCell row={row} months={col.months} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}

            {/* External Costs group */}
            {filteredExternalRows.length > 0 && (
              <>
                <TableRow className="bg-slate-50/50">
                  <TableCell
                    colSpan={colCount}
                    className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                  >
                    <div className="flex items-center justify-between">
                      <span>External Costs (EUR)</span>
                      {availableStatuses.length > 1 && (
                        <Select
                          value={statusFilter}
                          onValueChange={setStatusFilter}
                        >
                          <SelectTrigger className="h-6 w-[140px] text-[10px]">
                            <SelectValue placeholder="All statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            {availableStatuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                {getStatusLabel(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {filteredExternalRows.map((row) => (
                  <TableRow key={row.sub_category}>
                    <TableCell className="sticky left-0 bg-white font-medium text-sm z-10">
                      {row.sub_category_name}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-right">
                        {col.type === 'month' ? (
                          <ExternalMonthCell row={row} month={col.month} />
                        ) : (
                          <ExternalYearCell row={row} months={col.months} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Format YYYY-MM as short label, e.g. "Jan 26" */
function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
}

/** Internal resource: single month cell */
function InternalMonthCell({ row, month }: { row: ForecastGridRow; month: string }) {
  const cell = row.months.find((c) => c.month === month);
  if (!cell) return <span className="text-slate-300">—</span>;
  const rate = row.hourly_rate;
  return (
    <div>
      <span className="text-sm font-medium">
        {cell.forecast_hours.toLocaleString()} hrs
      </span>
      {rate && (
        <span className="block text-[10px] text-slate-400">
          {formatCurrencyDetailed(cell.forecast_hours * rate)}
        </span>
      )}
      <span className="block text-[10px] text-slate-400">
        BL: {cell.baseline_hours.toLocaleString()}
      </span>
      {cell.actuals_hours > 0 && (
        <span className="block text-[10px] text-slate-400">
          Act: {cell.actuals_hours.toLocaleString()}
        </span>
      )}
    </div>
  );
}

/** Internal resource: year summary cell (sum of hours) */
function InternalYearCell({ row, months }: { row: ForecastGridRow; months: string[] }) {
  const cells = months.map((m) => row.months.find((c) => c.month === m)).filter(Boolean) as ForecastMonthCell[];
  if (cells.length === 0) return <span className="text-slate-300">—</span>;
  const totalHours = cells.reduce((sum, c) => sum + c.forecast_hours, 0);
  const totalBL = cells.reduce((sum, c) => sum + c.baseline_hours, 0);
  const rate = row.hourly_rate;
  return (
    <div>
      <span className="text-sm font-medium">{totalHours.toLocaleString()} hrs</span>
      {rate && (
        <span className="block text-[10px] text-slate-400">
          {formatCurrency(totalHours * rate)}
        </span>
      )}
      <span className="block text-[10px] text-slate-400">
        BL: {totalBL.toLocaleString()}
      </span>
    </div>
  );
}

/** External cost: single month cell with status badge */
function ExternalMonthCell({ row, month }: { row: ForecastGridRow; month: string }) {
  const cell = row.months.find((c) => c.month === month);
  if (!cell) return <span className="text-slate-300">—</span>;

  const content = (
    <div>
      <span className="text-sm font-medium">
        {formatCurrency(cell.forecast_amount)}
      </span>
      <span className="block text-[10px] text-slate-400">
        BL: {formatCurrency(cell.baseline_amount)}
      </span>
      {cell.actuals_amount > 0 && (
        <span className="block text-[10px] text-slate-400">
          Act: {formatCurrency(cell.actuals_amount)}
        </span>
      )}
      {cell.ext_status && (
        <span className="block mt-0.5">
          <ExternalCostStatusBadge status={cell.ext_status} />
        </span>
      )}
    </div>
  );

  if (cell.vendor || cell.po_number) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {cell.vendor && <div>Vendor: {cell.vendor}</div>}
            {cell.po_number && <div>PO: {cell.po_number}</div>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

/** External cost: year summary cell (sum of amounts) */
function ExternalYearCell({ row, months }: { row: ForecastGridRow; months: string[] }) {
  const cells = months.map((m) => row.months.find((c) => c.month === m)).filter(Boolean) as ForecastMonthCell[];
  if (cells.length === 0) return <span className="text-slate-300">—</span>;
  const totalAmount = cells.reduce((sum, c) => sum + c.forecast_amount, 0);
  const totalBL = cells.reduce((sum, c) => sum + c.baseline_amount, 0);
  return (
    <div>
      <span className="text-sm font-medium">{formatCurrency(totalAmount)}</span>
      <span className="block text-[10px] text-slate-400">
        BL: {formatCurrency(totalBL)}
      </span>
    </div>
  );
}
