/**
 * External Costs monthly grid (v5.1 C-09 — Wave 5 Teammate B).
 *
 * One row per external cost line (vendor × sub-category × po-number ×
 * role) with stacked monthly cells (Forecast / Actuals / Accrual / PO-
 * Obligo) and a multi-column sticky-right region carrying the line's
 * Role / PO # / Contract End / Status / Open PO metadata.
 *
 * Owns its own data fetch via
 * `externalCostsApi.getProjectExternalCostsMonthlyGrid`. Refetches on
 * roleFilter / year change. Year columns collapsed/expanded via the
 * shared `useCollapsibleMixedYears` hook (current year expanded by
 * default). Year-summary columns sum the per-line monthly_cells across
 * the underlying month keys.
 *
 * Row expansion shows two panels: delivery_schedule (left) +
 * invoice_history (right). The category header rows (e.g. "CONSULTING")
 * are emitted as section dividers between sub_category groups.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react';
import { useCollapsibleMixedYears } from '@/hooks/useCollapsibleYears';
import { ExternalCostsGridLegend } from './ExternalCostsGridLegend';
import {
  DEMO_DATE,
  formatMonthShort,
  isElapsedMonth,
  isYearStartColumnKey,
} from '@/lib/yearColumns';
import {
  formatCurrency,
  formatCurrencyCompact,
} from '@/lib/formatters';
import { externalCostsApi } from '@/api/endpoints';
import { ExternalCostStatusBadge } from '../forecast/ExternalCostStatusBadge';
import { ExternalCostCell, type CellTemporalContext } from './ExternalCostCell';
import type {
  ExternalCostMonthlyCell,
  ExternalCostMonthlyGridItem,
  ExternalCostMonthlyGridResponse,
} from '@/types/api';

interface Props {
  projectId: string;
  year?: number;
  roleFilter: string | null;
}

// --- Sticky-right column geometry --------------------------------------------
// Cumulative offsets (px) from the right edge. Each cell's `right` style is
// the sum of widths to its right. Order rendered left-to-right:
//   Role | PO # | Contract End | Status | Open PO
const STICKY_RIGHT_WIDTHS = {
  role: 110,
  poNumber: 120,
  contractEnd: 100,
  status: 110,
  openPo: 110,
} as const;
const STICKY_RIGHT_OFFSETS = {
  // right offsets read left-to-right; rightmost is 0
  role: STICKY_RIGHT_WIDTHS.poNumber + STICKY_RIGHT_WIDTHS.contractEnd + STICKY_RIGHT_WIDTHS.status + STICKY_RIGHT_WIDTHS.openPo,
  poNumber: STICKY_RIGHT_WIDTHS.contractEnd + STICKY_RIGHT_WIDTHS.status + STICKY_RIGHT_WIDTHS.openPo,
  contractEnd: STICKY_RIGHT_WIDTHS.status + STICKY_RIGHT_WIDTHS.openPo,
  status: STICKY_RIGHT_WIDTHS.openPo,
  openPo: 0,
} as const;
// Left sticky vendor / sub-category column width.
const STICKY_LEFT_WIDTH = 240;

// Z-index ladder so sticky overlaps look right.
//   header corners (top + side) : 30
//   body sticky-left            : 10
//   body sticky-right           : 15
//   header month cells (top)    : 20
const Z_HEADER_CORNER = 30;
const Z_BODY_LEFT = 10;
const Z_BODY_RIGHT = 15;
const Z_HEADER_TOP = 20;

// --- Helpers ----------------------------------------------------------------

function temporalContextFor(monthKey: string): CellTemporalContext {
  if (monthKey < DEMO_DATE) return 'past';
  if (monthKey === DEMO_DATE) return 'current';
  return 'future';
}

function findCell(
  cells: ExternalCostMonthlyCell[],
  key: string,
): ExternalCostMonthlyCell | undefined {
  return cells.find((c) => c.month === key);
}

interface SummedCell {
  forecast: number;
  actuals: number;
  accrual: number;
  poObligo: number;
}

function sumCellsAcrossKeys(
  cells: ExternalCostMonthlyCell[],
  keys: string[],
): SummedCell {
  let forecast = 0;
  let actuals = 0;
  let accrual = 0;
  let poObligo = 0;
  for (const k of keys) {
    const c = findCell(cells, k);
    if (!c) continue;
    forecast += c.forecast ?? 0;
    actuals += c.actuals ?? 0;
    accrual += c.accrual ?? 0;
    poObligo += c.po_obligo ?? 0;
  }
  return { forecast, actuals, accrual, poObligo };
}

function lineKey(item: ExternalCostMonthlyGridItem): string {
  return (
    item.line_id ??
    `${item.vendor}|${item.sub_category}|${item.po_number ?? 'no-po'}`
  );
}

function formatContractEnd(month: string | null | undefined): string {
  if (!month) return '—';
  // YYYY-MM → "MMM YYYY"
  const yyyy = month.slice(0, 4);
  const short = formatMonthShort(month);
  return `${short} ${yyyy}`;
}

function formatLocaleDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExternalCostsMonthlyGrid({
  projectId,
  year,
  roleFilter,
}: Props) {
  const [data, setData] = useState<ExternalCostMonthlyGridResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    externalCostsApi
      .getProjectExternalCostsMonthlyGrid(projectId, year, roleFilter)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Could not load monthly grid',
        );
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, year, roleFilter]);

  const yearColumnKeys = useMemo(
    () => data?.year_columns ?? [],
    [data?.year_columns],
  );
  const { yearGroups, toggleYear, visibleColumns } =
    useCollapsibleMixedYears(yearColumnKeys);

  // Sort items by sub_category (stable) so the section dividers align with
  // contiguous category groups. Also sort within each category by vendor.
  const sortedItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.slice().sort((a, b) => {
      const cat = a.sub_category.localeCompare(b.sub_category);
      if (cat !== 0) return cat;
      return a.vendor.localeCompare(b.vendor);
    });
  }, [data?.items]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Total grid columns: 1 (left vendor) + N (month/year-summary) + 5 (right sticky).
  const stickyRightCount = 5;
  const totalCols = 1 + visibleColumns.length + stickyRightCount;

  if (loading) {
    return (
      <Card className="p-3">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </Card>
    );
  }

  if (!data || sortedItems.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Receipt}
          title="No external cost lines"
          description="No external cost lines for this project yet."
          size="sm"
        />
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <ExternalCostsGridLegend />
      <div className="overflow-x-auto">
        <Table className="border-separate border-spacing-0">
          {/*
            Elapsed-month tinting via a <colgroup>. One <col> per visible
            column plus the sticky-left and sticky-right columns. Tints the
            whole column down all body rows; sticky cells override with
            explicit `bg-card` so the sticky overlap stays clean.
          */}
          <colgroup>
            <col style={{ width: `${STICKY_LEFT_WIDTH}px` }} />
            {visibleColumns.map((col) => {
              if (col.type === 'yearSummary') {
                return (
                  <col
                    key={`col-yt-${col.year}`}
                    style={{ width: '100px' }}
                  />
                );
              }
              const tint = isElapsedMonth(col.key)
                ? 'hsl(var(--muted) / 0.4)'
                : undefined;
              return (
                <col
                  key={`col-${col.key}`}
                  style={{ width: '90px', backgroundColor: tint }}
                />
              );
            })}
            <col style={{ width: `${STICKY_RIGHT_WIDTHS.role}px` }} />
            <col style={{ width: `${STICKY_RIGHT_WIDTHS.poNumber}px` }} />
            <col style={{ width: `${STICKY_RIGHT_WIDTHS.contractEnd}px` }} />
            <col style={{ width: `${STICKY_RIGHT_WIDTHS.status}px` }} />
            <col style={{ width: `${STICKY_RIGHT_WIDTHS.openPo}px` }} />
          </colgroup>

          <TableHeader>
            {/* Year header row — only renders for collapsible years. Each
                year-summary column is a single column; expanded years span
                their N month columns. */}
            <TableRow className="bg-muted/50">
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  left: 0,
                  top: 0,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_LEFT_WIDTH}px`,
                }}
                className="bg-muted/50 border-r border-border whitespace-nowrap text-xs font-semibold text-foreground"
              >
                Vendor / Line
              </TableHead>
              {yearGroups.map((g) => {
                const isExpanded = g.isExpanded;
                const span = isExpanded ? g.keys.length : 1;
                if (span === 0) return null;
                return (
                  <TableHead
                    key={`yr-${g.year}`}
                    colSpan={span}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: Z_HEADER_TOP,
                    }}
                    className="bg-muted/50 text-center border-l-2 border-border text-xs font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => toggleYear(g.year)}
                      aria-expanded={isExpanded}
                      className="inline-flex items-center gap-1 cursor-pointer text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span>{g.year}</span>
                    </button>
                  </TableHead>
                );
              })}
              {/* Sticky-right header corners — rowSpan 2 so they cover both header rows. */}
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  top: 0,
                  right: STICKY_RIGHT_OFFSETS.role,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_RIGHT_WIDTHS.role}px`,
                }}
                className="bg-muted/50 text-left text-[11px] font-semibold border-l border-border"
              >
                Role
              </TableHead>
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  top: 0,
                  right: STICKY_RIGHT_OFFSETS.poNumber,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_RIGHT_WIDTHS.poNumber}px`,
                }}
                className="bg-muted/50 text-left text-[11px] font-semibold"
              >
                PO #
              </TableHead>
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  top: 0,
                  right: STICKY_RIGHT_OFFSETS.contractEnd,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_RIGHT_WIDTHS.contractEnd}px`,
                }}
                className="bg-muted/50 text-left text-[11px] font-semibold"
              >
                Contract end
              </TableHead>
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  top: 0,
                  right: STICKY_RIGHT_OFFSETS.status,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_RIGHT_WIDTHS.status}px`,
                }}
                className="bg-muted/50 text-left text-[11px] font-semibold"
              >
                Status
              </TableHead>
              <TableHead
                rowSpan={2}
                style={{
                  position: 'sticky',
                  top: 0,
                  right: STICKY_RIGHT_OFFSETS.openPo,
                  zIndex: Z_HEADER_CORNER,
                  minWidth: `${STICKY_RIGHT_WIDTHS.openPo}px`,
                }}
                className="bg-muted/50 text-right text-[11px] font-semibold"
              >
                Open PO
              </TableHead>
            </TableRow>

            {/* Month / year-summary header row. */}
            <TableRow className="bg-muted/30">
              {visibleColumns.map((col) => {
                if (col.type === 'yearSummary') {
                  return (
                    <TableHead
                      key={`yt-${col.year}`}
                      style={{
                        position: 'sticky',
                        top: 32,
                        zIndex: Z_HEADER_TOP,
                      }}
                      className="bg-muted/40 text-right text-[10px] font-semibold border-l-4 border-foreground/30 dark:border-foreground/40"
                    >
                      <span className="font-tabular">{col.year} Total</span>
                    </TableHead>
                  );
                }
                const isYearStart = col.isYearStart || isYearStartColumnKey(col.key);
                return (
                  <TableHead
                    key={`hdr-${col.key}`}
                    style={{
                      position: 'sticky',
                      top: 32,
                      zIndex: Z_HEADER_TOP,
                    }}
                    className={`bg-muted/30 text-right text-[10px] ${
                      isYearStart
                        ? 'border-l-4 border-foreground/30 dark:border-foreground/40 font-bold text-foreground'
                        : ''
                    }`}
                  >
                    <span className="font-tabular">
                      {formatMonthShort(col.key)}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {(() => {
              // Emit a category header before the first row of each unique
              // sub_category group. Use a running accumulator pattern.
              const out: React.ReactNode[] = [];
              let prevCategory: string | null = null;
              for (const item of sortedItems) {
                if (item.sub_category !== prevCategory) {
                  out.push(
                    <TableRow
                      key={`cat-hdr-${item.sub_category}`}
                      className="bg-muted/30"
                    >
                      <TableCell
                        colSpan={totalCols}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold py-1.5 px-3"
                      >
                        {item.sub_category_name || item.sub_category}
                      </TableCell>
                    </TableRow>,
                  );
                  prevCategory = item.sub_category;
                }
                const key = lineKey(item);
                const isOpen = expanded.has(key);
                out.push(
                  <Fragment key={`row-${key}`}>
                    <TableRow className="hover:bg-accent/30">
                      {/* Left sticky: chevron + vendor name. */}
                      <TableCell
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: Z_BODY_LEFT,
                          minWidth: `${STICKY_LEFT_WIDTH}px`,
                        }}
                        className="bg-card border-r border-border whitespace-nowrap cursor-pointer"
                        onClick={() => toggleExpand(key)}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(key);
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={
                              isOpen ? 'Collapse line' : 'Expand line'
                            }
                            aria-expanded={isOpen}
                          >
                            <ChevronRight
                              className={`h-3.5 w-3.5 transition-transform ${
                                isOpen ? 'rotate-90' : ''
                              }`}
                            />
                          </button>
                          <span className="text-sm font-medium text-foreground truncate">
                            {item.vendor}
                          </span>
                        </div>
                      </TableCell>

                      {/* Month / year-summary cells. */}
                      {visibleColumns.map((col) => {
                        if (col.type === 'yearSummary') {
                          const sums = sumCellsAcrossKeys(
                            item.monthly_cells,
                            col.keys,
                          );
                          // Year-summary is treated as 'past' if all the
                          // year is past, 'future' if all future, else
                          // 'current'. Cheap proxy: pick the first key.
                          const proxy = col.keys[0]
                            ? temporalContextFor(col.keys[0])
                            : 'future';
                          return (
                            <ExternalCostCell
                              key={`yt-${col.year}-${key}`}
                              forecast={sums.forecast}
                              actuals={sums.actuals}
                              accrual={sums.accrual}
                              poObligo={sums.poObligo}
                              temporalContext={proxy}
                            />
                          );
                        }
                        const cell = findCell(item.monthly_cells, col.key);
                        return (
                          <ExternalCostCell
                            key={`cell-${col.key}-${key}`}
                            forecast={cell?.forecast}
                            actuals={cell?.actuals}
                            accrual={cell?.accrual}
                            poObligo={cell?.po_obligo}
                            temporalContext={temporalContextFor(col.key)}
                          />
                        );
                      })}

                      {/* Sticky-right metadata cells. */}
                      <TableCell
                        style={{
                          position: 'sticky',
                          right: STICKY_RIGHT_OFFSETS.role,
                          zIndex: Z_BODY_RIGHT,
                          minWidth: `${STICKY_RIGHT_WIDTHS.role}px`,
                        }}
                        className="bg-card text-xs border-l border-border whitespace-nowrap"
                      >
                        {item.role_name ? (
                          <span className="text-foreground">
                            {item.role_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          position: 'sticky',
                          right: STICKY_RIGHT_OFFSETS.poNumber,
                          zIndex: Z_BODY_RIGHT,
                          minWidth: `${STICKY_RIGHT_WIDTHS.poNumber}px`,
                        }}
                        className="bg-card text-xs whitespace-nowrap"
                      >
                        {item.po_number ? (
                          <span className="font-mono text-[11px] text-foreground">
                            {item.po_number}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          position: 'sticky',
                          right: STICKY_RIGHT_OFFSETS.contractEnd,
                          zIndex: Z_BODY_RIGHT,
                          minWidth: `${STICKY_RIGHT_WIDTHS.contractEnd}px`,
                        }}
                        className="bg-card text-xs whitespace-nowrap"
                      >
                        <span
                          className={
                            item.contract_end_month
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }
                        >
                          {formatContractEnd(item.contract_end_month)}
                        </span>
                      </TableCell>
                      <TableCell
                        style={{
                          position: 'sticky',
                          right: STICKY_RIGHT_OFFSETS.status,
                          zIndex: Z_BODY_RIGHT,
                          minWidth: `${STICKY_RIGHT_WIDTHS.status}px`,
                        }}
                        className="bg-card text-xs whitespace-nowrap"
                      >
                        {item.status ? (
                          <ExternalCostStatusBadge status={item.status} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        style={{
                          position: 'sticky',
                          right: STICKY_RIGHT_OFFSETS.openPo,
                          zIndex: Z_BODY_RIGHT,
                          minWidth: `${STICKY_RIGHT_WIDTHS.openPo}px`,
                        }}
                        className="bg-card text-xs text-right tabular-nums whitespace-nowrap"
                      >
                        {item.open_po > 0 ? (
                          <span className="text-blue-700 dark:text-blue-400 font-semibold">
                            {formatCurrencyCompact(item.open_po)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow
                        key={`expand-${key}`}
                        className="bg-muted/30"
                      >
                        <TableCell
                          colSpan={totalCols}
                          className="px-4 py-3"
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                            {/* Delivery schedule */}
                            <section>
                              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Delivery schedule
                              </h4>
                              {item.delivery_schedule &&
                              item.delivery_schedule.length > 0 ? (
                                <dl className="space-y-1.5">
                                  {item.delivery_schedule.map((d, i) => (
                                    <div
                                      key={`del-${key}-${i}`}
                                      className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-baseline"
                                    >
                                      <dt className="text-foreground truncate">
                                        {d.milestone_name}
                                      </dt>
                                      <dd className="text-muted-foreground tabular-nums whitespace-nowrap">
                                        {formatContractEnd(d.expected_month)}
                                      </dd>
                                      <dd className="text-foreground tabular-nums whitespace-nowrap">
                                        {formatCurrency(d.expected_amount)}
                                      </dd>
                                      <dd className="text-[11px] whitespace-nowrap">
                                        {d.delivered_month ? (
                                          <span className="text-emerald-700 dark:text-emerald-400">
                                            delivered{' '}
                                            {formatContractEnd(
                                              d.delivered_month,
                                            )}
                                          </span>
                                        ) : (
                                          <span className="text-muted-foreground">
                                            pending
                                          </span>
                                        )}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </section>

                            {/* Invoice history */}
                            <section>
                              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Invoice history
                              </h4>
                              {item.invoice_history &&
                              item.invoice_history.length > 0 ? (
                                <dl className="space-y-1.5">
                                  {item.invoice_history.map((inv, i) => (
                                    <div
                                      key={`inv-${key}-${i}`}
                                      className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-baseline"
                                    >
                                      <dt className="font-mono text-[11px] text-foreground truncate">
                                        {inv.invoice_number}
                                      </dt>
                                      <dd className="text-muted-foreground tabular-nums whitespace-nowrap">
                                        {formatLocaleDate(inv.invoice_date)}
                                      </dd>
                                      <dd className="text-foreground tabular-nums whitespace-nowrap">
                                        {formatCurrency(inv.amount)}
                                      </dd>
                                      <dd className="text-[10px] whitespace-nowrap">
                                        <InvoiceStatusBadge
                                          status={inv.status}
                                        />
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </section>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>,
                );
              }
              return out;
            })()}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// Tiny inline badge for invoice status — generic muted/emerald/blue palette.
function InvoiceStatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    received:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  const className =
    palette[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium ${className}`}
    >
      {status}
    </span>
  );
}
