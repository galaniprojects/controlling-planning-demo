import { useMemo } from 'react';
import { useCollapsibleYears, type VisibleColumn } from '@/hooks/useCollapsibleYears';
import { formatMonthShort, isElapsedMonth, getDefaultExpandedYear } from '@/lib/yearColumns';
import { formatCurrency } from '@/lib/formatters';
import type { TimelineData, TimelineMonthPoint } from '@/types/api';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  data: TimelineData;
  status?: string;
  startMonth?: string | null;
  endMonth?: string | null;
}

type RowKey = 'baseline' | 'forecast' | 'actuals';

const ROWS: { key: RowKey; label: string }[] = [
  { key: 'baseline', label: 'Baseline' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'actuals', label: 'Actuals' },
];

function getValueForMonth(point: TimelineMonthPoint | undefined, rowKey: RowKey): number | null {
  if (!point) return null;
  if (rowKey === 'baseline') return point.baseline;
  if (rowKey === 'forecast') return point.forecast;
  return point.actuals;
}

export function MonthlyTimelineTable({ data, status, startMonth, endMonth }: Props) {
  const months = useMemo(() => data.monthly_data.map((d) => d.month), [data]);
  const defaultYear = getDefaultExpandedYear(status, startMonth, endMonth);
  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(months, defaultYear);

  // Build a month → data lookup
  const byMonth = useMemo(() => {
    const map: Record<string, TimelineMonthPoint> = {};
    for (const pt of data.monthly_data) map[pt.month] = pt;
    return map;
  }, [data]);

  // Compute year summaries for collapsed years
  const yearSums = useMemo(() => {
    const sums: Record<number, Record<RowKey, number>> = {};
    for (const group of yearGroups) {
      const s: Record<RowKey, number> = { baseline: 0, forecast: 0, actuals: 0 };
      for (const m of group.months) {
        const pt = byMonth[m];
        if (pt) {
          s.baseline += pt.baseline;
          s.forecast += pt.forecast;
          s.actuals += pt.actuals ?? 0;
        }
      }
      sums[group.year] = s;
    }
    return sums;
  }, [yearGroups, byMonth]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `max-content repeat(${visibleColumns.length}, minmax(80px, 1fr))`,
          }}
        >
          {/* Header row: year toggles + month names */}
          <div className="sticky left-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
            Monthly Breakdown
          </div>
          {visibleColumns.map((col) =>
            col.type === 'month' ? (
              <div
                key={col.key}
                className={cn(
                  'border-b border-slate-200 px-2 py-2 text-xs font-medium text-center',
                  isElapsedMonth(col.key) ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-600',
                  col.isJanuary && 'border-l border-slate-300',
                )}
              >
                {formatMonthShort(col.key)}
              </div>
            ) : (
              <button
                key={`yr-${col.year}`}
                type="button"
                onClick={() => toggleYear(col.year)}
                className="border-b border-l border-slate-200 bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-600 text-center hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <ChevronRight className="h-3 w-3" />
                {col.year}
              </button>
            ),
          )}

          {/* Year header row (expand/collapse toggles for expanded years) */}
          {yearGroups.some((g) => g.isExpanded && g.months.length > 1) && (
            <>
              <div className="sticky left-0 z-10 bg-white" />
              {renderYearHeaderCells(yearGroups, visibleColumns, toggleYear)}
            </>
          )}

          {/* Data rows */}
          {ROWS.map((row) => (
            <RowCells
              key={row.key}
              label={row.label}
              rowKey={row.key}
              visibleColumns={visibleColumns}
              byMonth={byMonth}
              yearSums={yearSums}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function renderYearHeaderCells(
  yearGroups: ReturnType<typeof useCollapsibleYears>['yearGroups'],
  visibleColumns: VisibleColumn[],
  toggleYear: (year: number) => void,
) {
  // For expanded years, render a spanning header with a collapse button
  const cells: React.ReactNode[] = [];
  let i = 0;
  for (const col of visibleColumns) {
    if (col.type === 'yearSummary') {
      cells.push(<div key={`yh-skip-${i}`} />);
      i++;
      continue;
    }
    // Check if this is the first month of its year group
    const group = yearGroups.find((g) => g.year === col.year);
    const isFirst = group?.months[0] === col.key;
    if (isFirst && group) {
      cells.push(
        <button
          key={`yh-${col.year}`}
          type="button"
          onClick={() => toggleYear(col.year)}
          style={{ gridColumn: `span ${group.months.length}` }}
          className="bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 text-center hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center gap-0.5 border-b border-slate-100"
        >
          <ChevronDown className="h-2.5 w-2.5" />
          FY {col.year}
        </button>,
      );
    }
    i++;
  }
  return cells;
}

interface RowCellsProps {
  label: string;
  rowKey: RowKey;
  visibleColumns: VisibleColumn[];
  byMonth: Record<string, TimelineMonthPoint>;
  yearSums: Record<number, Record<RowKey, number>>;
}

function RowCells({ label, rowKey, visibleColumns, byMonth, yearSums }: RowCellsProps) {
  return (
    <>
      <div className="sticky left-0 z-10 bg-white border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap">
        {label}
      </div>
      {visibleColumns.map((col) => {
        if (col.type === 'yearSummary') {
          const val = yearSums[col.year]?.[rowKey] ?? 0;
          return (
            <div
              key={`${rowKey}-yr-${col.year}`}
              className="border-b border-l border-slate-100 bg-slate-50 px-2 py-2 text-xs text-right text-slate-600 font-medium"
            >
              {formatCurrency(val)}
            </div>
          );
        }
        const point = byMonth[col.key];
        const val = getValueForMonth(point, rowKey);
        return (
          <div
            key={`${rowKey}-${col.key}`}
            className={cn(
              'border-b border-slate-100 px-2 py-2 text-xs text-right',
              isElapsedMonth(col.key) ? 'bg-slate-50/50 text-slate-600' : 'text-slate-700',
              col.isJanuary && 'border-l border-slate-200',
              val === null && 'text-slate-300',
            )}
          >
            {val != null ? formatCurrency(val) : '\u2014'}
          </div>
        );
      })}
    </>
  );
}
