/**
 * DetailViewGrid — Reusable month × line-item grid with collapsible years.
 *
 * Two cell patterns:
 * - "comparison": before/after with delta coloring (Approvals, Change History, Forecast Review)
 * - "intake": single values, no deltas (Intake)
 *
 * Used in 4 locations across the app. Context-specific adaptations passed via props.
 */
import { useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useCollapsibleYears, type VisibleColumn } from '@/hooks/useCollapsibleYears';
import { isElapsedMonth, formatMonthShort } from '@/lib/yearColumns';
import { formatCurrencyDetailed } from '@/lib/formatters';
import { Skeleton } from '@/components/shared/Skeleton';
import type { DetailViewLineItem, DetailViewMonthValue } from '@/lib/detailViewTypes';

type CellPattern = 'comparison' | 'intake';

interface DetailViewGridProps {
  lineItems: DetailViewLineItem[];
  months: string[];
  cellPattern: CellPattern;
  loading?: boolean;
  defaultExpandedYear?: number;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtHours(v: number): string {
  if (v === 0) return '—';
  return `${Math.round(v)}h`;
}

function fmtEur(v: number): string {
  if (v === 0) return '—';
  return formatCurrencyDetailed(v);
}

function fmtPrimary(v: number, unit: 'hours' | 'eur'): string {
  return unit === 'hours' ? fmtHours(v) : fmtEur(v);
}

function fmtDeltaPrimary(delta: number, unit: 'hours' | 'eur'): string {
  const sign = delta > 0 ? '+' : '';
  if (unit === 'hours') return `${sign}${Math.round(delta)}h`;
  return `${sign}${formatCurrencyDetailed(delta)}`;
}

/** Inline compact: "160h (€19.2K)" or just "€30K" */
function fmtWithEur(v: number, eurV: number, unit: 'hours' | 'eur'): string {
  if (unit === 'eur') return fmtEur(v);
  if (v === 0) return '—';
  return `${fmtHours(v)} (${fmtEur(eurV)})`;
}

function fmtDeltaWithEur(delta: number, deltaEur: number, unit: 'hours' | 'eur'): string {
  if (unit === 'eur') return fmtDeltaPrimary(delta, 'eur');
  const sign = delta > 0 ? '+' : '';
  return `${sign}${Math.round(delta)}h (${fmtDeltaPrimary(deltaEur, 'eur')})`;
}

// ---------------------------------------------------------------------------
// Delta color logic (§6.2)
// ---------------------------------------------------------------------------

/** Returns tailwind text color class for delta */
function deltaColor(current: number, proposed: number): string {
  const delta = proposed - current;
  if (delta < 0) return 'text-[#059669]'; // green: reduction
  if (delta === 0) return 'text-slate-400';
  // new from zero → red
  if (current === 0) return 'text-[#dc2626]';
  // percentage change
  const pct = Math.abs(delta / current) * 100;
  if (pct >= 25) return 'text-[#dc2626]'; // red: significant ≥25%
  return 'text-[#2563eb]'; // blue: moderate <25%
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DetailViewGrid({
  lineItems,
  months,
  cellPattern,
  loading,
  defaultExpandedYear,
}: DetailViewGridProps) {
  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(months, defaultExpandedYear);

  // Group line items by category
  const { internal, external } = useMemo(() => {
    const internal: DetailViewLineItem[] = [];
    const external: DetailViewLineItem[] = [];
    for (const li of lineItems) {
      if (li.category === 'internal') internal.push(li);
      else external.push(li);
    }
    return { internal, external };
  }, [lineItems]);

  // Summary column count depends on pattern
  const summaryColCount = cellPattern === 'comparison' ? 3 : 1;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (lineItems.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 p-6 text-center text-sm text-slate-400">
        No line items to display.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full border-collapse text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {/* Year header row */}
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap border-b border-slate-200" />
              {yearGroups.map((yg) => {
                const colSpan = yg.isExpanded ? yg.months.length : 1;
                return (
                  <th
                    key={yg.year}
                    colSpan={colSpan}
                    className="px-2 py-1.5 text-center font-semibold text-blue-800 cursor-pointer select-none border-b border-slate-200 border-l border-l-slate-300"
                    onClick={() => toggleYear(yg.year)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {yg.isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {yg.year}
                    </span>
                  </th>
                );
              })}
              {/* Summary columns header */}
              {cellPattern === 'comparison' ? (
                <>
                  <th className="px-2 py-1.5 text-right font-medium text-slate-600 border-b border-slate-200 border-l border-l-slate-300 min-w-[80px]">Current</th>
                  <th className="px-2 py-1.5 text-right font-medium text-slate-600 border-b border-slate-200 min-w-[80px]">Proposed</th>
                  <th className="px-2 py-1.5 text-right font-medium text-slate-600 border-b border-slate-200 min-w-[80px]">Delta</th>
                </>
              ) : (
                <th className="px-2 py-1.5 text-right font-medium text-slate-600 border-b border-slate-200 border-l border-l-slate-300 min-w-[80px]">Total</th>
              )}
            </tr>

            {/* Month header row */}
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1 text-left text-slate-500 border-b border-slate-200" />
              {visibleColumns.map((col, i) => {
                if (col.type === 'month') {
                  return (
                    <th
                      key={col.key}
                      className={`px-2 py-1 text-center text-slate-500 font-normal border-b border-slate-200 ${
                        col.isJanuary ? 'border-l-2 border-l-slate-400' : ''
                      } ${isElapsedMonth(col.key) ? 'bg-[#fafafa]' : ''}`}
                    >
                      {formatMonthShort(col.key)}
                    </th>
                  );
                }
                return (
                  <th
                    key={`ys-${col.year}`}
                    className="px-2 py-1 text-center text-slate-500 font-normal border-b border-slate-200 border-l border-l-slate-300"
                  >
                    Total
                  </th>
                );
              })}
              {Array.from({ length: summaryColCount }).map((_, i) => (
                <th key={`sh-${i}`} className="border-b border-slate-200" />
              ))}
            </tr>
          </thead>

          <tbody>
            {internal.length > 0 && (
              <>
                <SectionHeader
                  label="INTERNAL RESOURCES"
                  colSpan={visibleColumns.length + 1 + summaryColCount}
                />
                {internal.map((li) => (
                  <LineItemRow
                    key={li.id}
                    item={li}
                    visibleColumns={visibleColumns}
                    cellPattern={cellPattern}
                  />
                ))}
              </>
            )}
            {external.length > 0 && (
              <>
                <SectionHeader
                  label="EXTERNAL COSTS"
                  colSpan={visibleColumns.length + 1 + summaryColCount}
                />
                {external.map((li) => (
                  <LineItemRow
                    key={li.id}
                    item={li}
                    visibleColumns={visibleColumns}
                    cellPattern={cellPattern}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {cellPattern === 'comparison' && (
        <p className="text-[10px] text-slate-400 text-right px-1">
          Color thresholds are configurable (currently 25%)
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase bg-slate-50 border-b border-slate-100"
      >
        {label}
      </td>
    </tr>
  );
}

interface LineItemRowProps {
  item: DetailViewLineItem;
  visibleColumns: VisibleColumn[];
  cellPattern: CellPattern;
}

function LineItemRow({ item, visibleColumns, cellPattern }: LineItemRowProps) {
  // Build a lookup map month → value
  const monthMap = useMemo(() => {
    const m = new Map<string, DetailViewMonthValue>();
    for (const mv of item.months) {
      m.set(mv.month, mv);
    }
    return m;
  }, [item.months]);

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      {/* Line item name */}
      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700 font-medium whitespace-nowrap border-r border-slate-100">
        {item.name}
      </td>

      {/* Monthly / year summary cells */}
      {visibleColumns.map((col) => {
        if (col.type === 'month') {
          const mv = monthMap.get(col.key);
          const elapsed = isElapsedMonth(col.key);
          return (
            <td
              key={col.key}
              className={`px-2 py-1.5 text-right align-top ${
                col.isJanuary ? 'border-l-2 border-l-slate-400' : ''
              } ${elapsed ? 'bg-[#fafafa]' : ''}`}
            >
              {cellPattern === 'comparison'
                ? renderComparisonCell(mv, item.unit)
                : renderIntakeCell(mv, item.unit)}
            </td>
          );
        }

        // Year summary: sum across collapsed months
        const yearMonths = col.months;
        return (
          <td
            key={`ys-${col.year}`}
            className="px-2 py-1.5 text-right align-top border-l border-l-slate-300"
          >
            {cellPattern === 'comparison'
              ? renderComparisonYearSummary(yearMonths, monthMap, item.unit)
              : renderIntakeYearSummary(yearMonths, monthMap, item.unit)}
          </td>
        );
      })}

      {/* Row totals */}
      {cellPattern === 'comparison' ? (
        <>
          <td className="px-2 py-1.5 text-right font-medium text-slate-500 border-l border-l-slate-300 whitespace-nowrap">
            {fmtWithEur(item.current_total ?? 0, item.current_total_eur ?? 0, item.unit)}
          </td>
          <td className="px-2 py-1.5 text-right font-semibold text-slate-800 whitespace-nowrap">
            {fmtWithEur(item.proposed_total, item.proposed_total_eur, item.unit)}
          </td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap">
            {(() => {
              const delta = item.proposed_total - (item.current_total ?? 0);
              const deltaEur = item.proposed_total_eur - (item.current_total_eur ?? 0);
              if (delta === 0) return <span className="text-slate-400">—</span>;
              const color = deltaColor(item.current_total ?? 0, item.proposed_total);
              return (
                <span className={`font-semibold ${color}`}>
                  {fmtDeltaWithEur(delta, deltaEur, item.unit)}
                </span>
              );
            })()}
          </td>
        </>
      ) : (
        <td className="px-2 py-1.5 text-right font-semibold text-slate-800 border-l border-l-slate-300 whitespace-nowrap">
          {fmtWithEur(item.proposed_total, item.proposed_total_eur, item.unit)}
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Cell renderers
// ---------------------------------------------------------------------------

function renderComparisonCell(mv: DetailViewMonthValue | undefined, unit: 'hours' | 'eur') {
  if (!mv) return <span className="text-slate-300">—</span>;

  if (!mv.is_changed) {
    // Unchanged: single muted value
    return (
      <span className="text-[#94a3b8]">
        {fmtPrimary(mv.proposed, unit)}
      </span>
    );
  }

  // Changed cell: three-line stack
  const current = mv.current ?? 0;
  const currentEur = mv.current_eur ?? 0;
  const delta = mv.proposed - current;
  const deltaEur = mv.proposed_eur - currentEur;
  const color = deltaColor(current, mv.proposed);

  return (
    <div className="bg-[#fffbeb] rounded px-1 py-0.5 -mx-1 space-y-0">
      <div className="font-semibold text-[#0f172a] whitespace-nowrap">
        {fmtWithEur(mv.proposed, mv.proposed_eur, unit)}
      </div>
      <div className={`font-medium ${color} whitespace-nowrap`}>
        {fmtDeltaWithEur(delta, deltaEur, unit)}
      </div>
      <div className="text-[#94a3b8] whitespace-nowrap">
        {fmtWithEur(current, currentEur, unit)}
      </div>
    </div>
  );
}

function renderIntakeCell(mv: DetailViewMonthValue | undefined, unit: 'hours' | 'eur') {
  if (!mv || mv.proposed === 0) {
    return <span className="text-slate-300">—</span>;
  }
  return <span className="text-slate-700">{fmtWithEur(mv.proposed, mv.proposed_eur, unit)}</span>;
}

function renderComparisonYearSummary(
  yearMonths: string[],
  monthMap: Map<string, DetailViewMonthValue>,
  unit: 'hours' | 'eur',
) {
  let proposed = 0;
  let current = 0;
  let anyChanged = false;
  for (const m of yearMonths) {
    const mv = monthMap.get(m);
    if (mv) {
      proposed += mv.proposed;
      current += mv.current ?? mv.proposed;
      if (mv.is_changed) anyChanged = true;
    }
  }

  if (!anyChanged) {
    return <span className="text-[#94a3b8]">{fmtPrimary(proposed, unit)}</span>;
  }

  const delta = proposed - current;
  const color = deltaColor(current, proposed);
  return (
    <div className="space-y-0">
      <div className="font-semibold text-[#0f172a]">{fmtPrimary(proposed, unit)}</div>
      <div className={`font-medium ${color}`}>{fmtDeltaPrimary(delta, unit)}</div>
    </div>
  );
}

function renderIntakeYearSummary(
  yearMonths: string[],
  monthMap: Map<string, DetailViewMonthValue>,
  unit: 'hours' | 'eur',
) {
  let total = 0;
  let totalEur = 0;
  for (const m of yearMonths) {
    const mv = monthMap.get(m);
    if (mv) {
      total += mv.proposed;
      totalEur += mv.proposed_eur;
    }
  }
  if (total === 0) return <span className="text-slate-300">—</span>;
  return <span className="text-slate-700">{fmtWithEur(total, totalEur, unit)}</span>;
}
