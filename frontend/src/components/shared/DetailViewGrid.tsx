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
  if (delta < 0) return 'text-emerald-600 dark:text-emerald-400'; // green: reduction
  if (delta === 0) return 'text-muted-foreground';
  // new from zero → red
  if (current === 0) return 'text-red-600 dark:text-red-400';
  // percentage change
  const pct = Math.abs(delta / current) * 100;
  if (pct >= 25) return 'text-red-600 dark:text-red-400'; // red: significant ≥25%
  return 'text-blue-600 dark:text-blue-400'; // blue: moderate <25%
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
      <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
        No line items to display.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {/* Year header row */}
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border" />
              {yearGroups.map((yg) => {
                const colSpan = yg.isExpanded ? yg.months.length : 1;
                return (
                  <th
                    key={yg.year}
                    colSpan={colSpan}
                    className="px-2 py-1.5 text-center font-semibold text-primary cursor-pointer select-none border-b border-border border-l border-l-border"
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
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground border-b border-border border-l border-l-border min-w-[80px]">Current</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground border-b border-border min-w-[80px]">Proposed</th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground border-b border-border min-w-[80px]">Delta</th>
                </>
              ) : (
                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground border-b border-border border-l border-l-border min-w-[80px]">Total</th>
              )}
            </tr>

            {/* Month header row */}
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-3 py-1 text-left text-muted-foreground border-b border-border" />
              {visibleColumns.map((col) => {
                if (col.type === 'month') {
                  return (
                    <th
                      key={col.key}
                      className={`px-2 py-1 text-center text-muted-foreground font-normal border-b border-border ${
                        col.isJanuary ? 'border-l-2 border-l-border' : ''
                      } ${isElapsedMonth(col.key) ? 'bg-muted/80' : ''}`}
                    >
                      {formatMonthShort(col.key)}
                    </th>
                  );
                }
                return (
                  <th
                    key={`ys-${col.year}`}
                    className="px-2 py-1 text-center text-muted-foreground font-normal border-b border-border border-l border-l-border"
                  >
                    Total
                  </th>
                );
              })}
              {Array.from({ length: summaryColCount }).map((_, i) => (
                <th key={`sh-${i}`} className="border-b border-border" />
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
        <p className="text-[10px] text-muted-foreground text-right px-1">
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
        className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase bg-muted border-b border-border"
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
    <tr className="border-b border-border hover:bg-accent/30">
      {/* Line item name */}
      <td className="sticky left-0 z-10 bg-card px-3 py-2 text-sm text-foreground font-medium whitespace-nowrap border-r border-border">
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
                col.isJanuary ? 'border-l-2 border-l-border' : ''
              } ${elapsed ? 'bg-muted/50' : ''}`}
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
            className="px-2 py-1.5 text-right align-top border-l border-l-border"
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
          <td className="px-2 py-1.5 text-right font-medium text-muted-foreground border-l border-l-border whitespace-nowrap">
            {fmtWithEur(item.current_total ?? 0, item.current_total_eur ?? 0, item.unit)}
          </td>
          <td className="px-2 py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
            {fmtWithEur(item.proposed_total, item.proposed_total_eur, item.unit)}
          </td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap">
            {(() => {
              const delta = item.proposed_total - (item.current_total ?? 0);
              const deltaEur = item.proposed_total_eur - (item.current_total_eur ?? 0);
              if (delta === 0) return <span className="text-muted-foreground">—</span>;
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
        <td className="px-2 py-1.5 text-right font-semibold text-foreground border-l border-l-border whitespace-nowrap">
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
  if (!mv) return <span className="text-muted-foreground/40">—</span>;

  if (!mv.is_changed) {
    // Unchanged: single muted value
    return (
      <span className="text-muted-foreground">
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
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded px-1 py-0.5 -mx-1 space-y-0">
      <div className="font-semibold text-foreground whitespace-nowrap">
        {fmtWithEur(mv.proposed, mv.proposed_eur, unit)}
      </div>
      <div className={`font-medium ${color} whitespace-nowrap`}>
        {fmtDeltaWithEur(delta, deltaEur, unit)}
      </div>
      <div className="text-muted-foreground whitespace-nowrap">
        {fmtWithEur(current, currentEur, unit)}
      </div>
    </div>
  );
}

function renderIntakeCell(mv: DetailViewMonthValue | undefined, unit: 'hours' | 'eur') {
  if (!mv || mv.proposed === 0) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  return <span className="text-foreground">{fmtWithEur(mv.proposed, mv.proposed_eur, unit)}</span>;
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
    return <span className="text-muted-foreground">{fmtPrimary(proposed, unit)}</span>;
  }

  const delta = proposed - current;
  const color = deltaColor(current, proposed);
  return (
    <div className="space-y-0">
      <div className="font-semibold text-foreground">{fmtPrimary(proposed, unit)}</div>
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
  if (total === 0) return <span className="text-muted-foreground/40">—</span>;
  return <span className="text-foreground">{fmtWithEur(total, totalEur, unit)}</span>;
}
