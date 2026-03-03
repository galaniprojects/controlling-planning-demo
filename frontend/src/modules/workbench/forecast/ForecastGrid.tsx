import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency } from '@/lib/formatters';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow } from '@/types/api';

interface Props {
  projectId: string;
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

  // Collect all unique months
  const allMonths = Array.from(
    new Set(rows.flatMap((r) => r.months.map((m) => m.month))),
  ).sort();

  const internalRows = rows.filter((r) => r.category === 'internal');
  const externalRows = rows.filter((r) => r.category === 'external');

  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="sticky left-0 bg-slate-50 min-w-[180px]">
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
                  <TableCell className="sticky left-0 bg-white font-medium text-sm">
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
          {externalRows.length > 0 && (
            <>
              <TableRow className="bg-slate-50/50">
                <TableCell
                  colSpan={allMonths.length + 1}
                  className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                >
                  External Costs (EUR)
                </TableCell>
              </TableRow>
              {externalRows.map((row) => (
                <TableRow key={row.sub_category}>
                  <TableCell className="sticky left-0 bg-white font-medium text-sm">
                    {row.sub_category_name}
                  </TableCell>
                  {allMonths.map((m) => {
                    const cell = row.months.find((c) => c.month === m);
                    return (
                      <TableCell key={m} className="text-right">
                        {cell ? (
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
        </TableBody>
      </Table>
    </div>
  );
}
