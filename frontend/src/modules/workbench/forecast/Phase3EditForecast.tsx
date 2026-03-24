import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatCurrencyCompact, formatCurrencyDetailed } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { workbenchApi } from '@/api/endpoints';
import type { ForecastGridRow, ForecastChange, ForecastMonthCell, SuggestionItem } from '@/types/api';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import { ChevronRight } from 'lucide-react';

const DEMO_DATE = '2026-03';

interface Props {
  projectId: string;
  workingChanges: ForecastChange[];
  appliedSuggestionIds: number[];
  suggestions: SuggestionItem[];
  onCellChange: (change: ForecastChange) => void;
  onSaveAndReview: () => void;
  loading: boolean;
}

export function Phase3EditForecast({
  projectId,
  workingChanges,
  appliedSuggestionIds,
  suggestions,
  onCellChange,
  onSaveAndReview,
  loading,
}: Props) {
  const [rows, setRows] = useState<ForecastGridRow[]>([]);
  const [gridLoading, setGridLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  useEffect(() => {
    setGridLoading(true);
    workbenchApi
      .getForecast(projectId)
      .then((res) => {
        setRows(res.items);
        // Apply suggestion pre-fills if not already in working changes
        if (appliedSuggestionIds.length > 0 && workingChanges.length === 0) {
          suggestions
            .filter((s) => appliedSuggestionIds.includes(s.id))
            .forEach((s) => {
              s.pre_filled_changes.forEach((pf) => {
                onCellChange({
                  category: pf.category || 'internal',
                  sub_category: pf.sub_category,
                  month: pf.month,
                  old_value: pf.old_value,
                  new_value: pf.new_value,
                  delta: pf.new_value - pf.old_value,
                  suggestion_id: s.id,
                });
              });
            });
        }
      })
      .catch(() => setRows([]))
      .finally(() => setGridLoading(false));
  }, [projectId]);

  const allMonths = useMemo(
    () =>
      Array.from(
        new Set(rows.flatMap((r) => r.months.map((m) => m.month))),
      ).sort(),
    [rows],
  );

  const { visibleColumns: columns, toggleYear } = useCollapsibleYears(allMonths);

  const internalRows = useMemo(
    () => rows.filter((r) => r.category === 'internal'),
    [rows],
  );
  const externalRows = useMemo(
    () => rows.filter((r) => r.category === 'external'),
    [rows],
  );

  const getWorkingValue = (subCategory: string, month: string) => {
    return workingChanges.find(
      (c) => c.sub_category === subCategory && c.month === month,
    );
  };

  // Convert all deltas to EUR: internal deltas are hours × hourly_rate, external are already EUR
  const totalDeltaEurEur = workingChanges.reduce((sum, c) => {
    if (c.category === 'internal') {
      const row = rows.find((r) => r.sub_category === c.sub_category && r.category === 'internal');
      const rate = row?.hourly_rate ?? 0;
      return sum + c.delta * rate;
    }
    return sum + c.delta;
  }, 0);

  const isEditable = (month: string) => month >= DEMO_DATE;

  const handleCellEdit = (
    category: string,
    subCategory: string,
    month: string,
    originalValue: number,
    newValueStr: string,
  ) => {
    const newValue = parseFloat(newValueStr);
    if (isNaN(newValue) || newValue < 0) return;
    const existingChange = getWorkingValue(subCategory, month);
    onCellChange({
      category,
      sub_category: subCategory,
      month,
      old_value: existingChange?.old_value ?? originalValue,
      new_value: newValue,
      delta: newValue - (existingChange?.old_value ?? originalValue),
      suggestion_id: existingChange?.suggestion_id,
    });
    setEditingCell(null);
  };

  const renderEditableCell = (
    category: string,
    row: ForecastGridRow,
    month: string,
  ) => {
    const cell = row.months?.find((c) => c.month === month);
    if (!cell) return <span className="text-slate-300">—</span>;

    const isInternal = category === 'internal';
    const originalValue = isInternal ? cell.forecast_hours : cell.forecast_amount;
    const change = getWorkingValue(row.sub_category, month);
    const displayValue = change ? change.new_value : originalValue;
    const cellKey = `${row.sub_category}:${month}`;
    const canEdit = isEditable(month);
    const isEditing = editingCell === cellKey;
    const isSuggested = change?.suggestion_id != null;
    const isChanged = change != null;

    if (isEditing && canEdit) {
      return (
        <Input
          type="number"
          className="h-7 w-20 text-right text-sm p-1"
          defaultValue={displayValue}
          autoFocus
          onBlur={(e) =>
            handleCellEdit(
              category,
              row.sub_category,
              month,
              originalValue,
              e.target.value,
            )
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCellEdit(
                category,
                row.sub_category,
                month,
                originalValue,
                (e.target as HTMLInputElement).value,
              );
            }
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    const rate = isInternal ? row.hourly_rate : undefined;

    if (!canEdit) {
      // Read-only past cell
      return (
        <div className="bg-slate-50 rounded px-1.5 py-0.5">
          <span className="text-sm text-slate-500">
            {isInternal
              ? `${displayValue.toLocaleString()} hrs`
              : formatCurrency(displayValue)}
          </span>
          {isInternal && rate && (
            <span className="block text-[10px] text-slate-300">
              {formatCurrencyDetailed(displayValue * rate)}
            </span>
          )}
        </div>
      );
    }

    return (
      <div>
        <button
          className={cn(
            'text-sm font-medium cursor-pointer px-1.5 py-0.5 rounded transition-colors w-full text-right',
            isSuggested && 'bg-blue-50 text-blue-700',
            isChanged && !isSuggested && 'bg-yellow-50 text-yellow-700',
            !isChanged && 'hover:bg-slate-100',
          )}
          onClick={() => setEditingCell(cellKey)}
        >
          {isInternal
            ? `${displayValue.toLocaleString()} hrs`
            : formatCurrency(displayValue)}
        </button>
        {isInternal && rate && (
          <span className="block text-[10px] text-slate-400 text-right pr-1.5">
            {formatCurrencyDetailed(displayValue * rate)}
          </span>
        )}
      </div>
    );
  };

  /** Render a year summary cell (collapsed year column) */
  const renderYearSummary = (
    category: string,
    row: ForecastGridRow,
    months: string[],
  ) => {
    const isInternal = category === 'internal';
    const cells = months
      .map((m) => row.months.find((c) => c.month === m))
      .filter(Boolean) as ForecastMonthCell[];
    if (cells.length === 0) return <span className="text-slate-300">—</span>;

    const total = isInternal
      ? cells.reduce((s, c) => s + c.forecast_hours, 0)
      : cells.reduce((s, c) => s + c.forecast_amount, 0);
    const rate = isInternal ? row.hourly_rate : undefined;

    return (
      <div className="bg-slate-50 rounded px-1.5 py-0.5">
        <span className="text-sm text-slate-500">
          {isInternal ? `${total.toLocaleString()} hrs` : formatCurrency(total)}
        </span>
        {isInternal && rate && (
          <span className="block text-[10px] text-slate-300">
            {formatCurrency(total * rate)}
          </span>
        )}
      </div>
    );
  };

  /** Format month label */
  const formatMonth = (m: string): string => {
    const [y, mo] = m.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
  };

  if (gridLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const colCount = columns.length + 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800">
          Phase 3: Edit Forecast
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Click any cell to edit future months. Past months are read-only (greyed out).
          Blue cells are from applied suggestions, yellow cells are manual changes.
        </p>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-x-auto max-w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="sticky left-0 bg-slate-50 z-10 border-r border-slate-200 whitespace-nowrap">
                Line Item
              </TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col.type === 'month' ? col.key : `sum-${col.year}`}
                  className={cn(
                    'text-right min-w-[90px]',
                    col.type === 'yearSummary' && 'cursor-pointer select-none hover:bg-slate-100',
                    col.type === 'month' && !isEditable(col.key) && 'bg-slate-100/50',
                  )}
                  onClick={col.type === 'yearSummary' ? () => toggleYear(col.year) : undefined}
                >
                  {col.type === 'month' ? (
                    <span>
                      {formatMonth(col.key)}
                      {!isEditable(col.key) && (
                        <span className="block text-[9px] text-slate-400">read-only</span>
                      )}
                    </span>
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
                  <TableRow key={`${row.category}-${row.sub_category}`}>
                    <TableCell className="sticky left-0 bg-white font-medium text-sm z-10 border-r border-slate-200">
                      {row.sub_category_name}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.type === 'month' ? col.key : `sum-${col.year}`} className="p-1">
                        {col.type === 'month'
                          ? renderEditableCell('internal', row, col.key)
                          : renderYearSummary('internal', row, col.months)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}

            {externalRows.length > 0 && (
              <>
                <TableRow className="bg-slate-50/50">
                  <TableCell
                    colSpan={colCount}
                    className="font-medium text-xs text-slate-500 uppercase tracking-wide"
                  >
                    External Costs (EUR)
                  </TableCell>
                </TableRow>
                {externalRows.map((row) => (
                  <TableRow key={`${row.category}-${row.sub_category}`}>
                    <TableCell className="sticky left-0 bg-white font-medium text-sm z-10 border-r border-slate-200">
                      {row.sub_category_name}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.type === 'month' ? col.key : `sum-${col.year}`} className="p-1">
                        {col.type === 'month'
                          ? renderEditableCell('external', row, col.key)
                          : renderYearSummary('external', row, col.months)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Change summary bar */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <span className="text-sm text-slate-600">
          {workingChanges.length} change{workingChanges.length !== 1 ? 's' : ''}
          {totalDeltaEur !== 0 && (
            <span
              className={cn(
                'ml-2 font-medium',
                totalDeltaEur > 0 ? 'text-red-600' : 'text-green-600',
              )}
            >
              (total impact: {totalDeltaEur > 0 ? '+' : ''}
              {formatCurrencyCompact(totalDeltaEur)})
            </span>
          )}
        </span>
        <Button
          onClick={onSaveAndReview}
          disabled={loading || workingChanges.length === 0}
        >
          {loading ? 'Saving...' : 'Review Changes'}
        </Button>
      </div>
    </div>
  );
}
