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
import { formatCurrency } from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow, ForecastMonthCell } from '@/types/api';
import {
  ExternalCostStatusBadge,
  STATUS_SUMMARY_ORDER,
  getStatusLabel,
} from './ExternalCostStatusBadge';

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

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="sticky left-0 bg-slate-50 min-w-[180px] z-10">
                Line Item
              </TableHead>
              {allMonths.map((m) => (
                <TableHead key={m} className="text-right min-w-[100px]">
                  {m}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Internal Resources group */}
            {internalRows.length > 0 && (
              <>
                <TableRow className="bg-slate-50/50">
                  <TableCell
                    colSpan={allMonths.length + 1}
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
                    {allMonths.map((m) => {
                      const cell = row.months.find((c) => c.month === m);
                      return (
                        <TableCell key={m} className="text-right">
                          {cell ? (
                            <div>
                              <span className="text-sm font-medium">
                                {cell.forecast_hours.toLocaleString()}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                BL: {cell.baseline_hours.toLocaleString()}
                              </span>
                              {cell.actuals_hours > 0 && (
                                <span className="block text-[10px] text-slate-400">
                                  Act: {cell.actuals_hours.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </>
            )}

            {/* External Costs group */}
            {filteredExternalRows.length > 0 && (
              <>
                <TableRow className="bg-slate-50/50">
                  <TableCell
                    colSpan={allMonths.length + 1}
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
                    {allMonths.map((m) => {
                      const cell = row.months.find((c) => c.month === m);
                      return (
                        <TableCell key={m} className="text-right">
                          {cell ? (
                            <ExternalCostCell cell={cell} />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
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
    </div>
  );
}

/** External cost cell with status badge and vendor tooltip */
function ExternalCostCell({ cell }: { cell: ForecastMonthCell }) {
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

  // Show tooltip with vendor/PO info if available
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
