/**
 * Workbench External Costs tab per [E-08a..b].
 *
 * Three sections:
 *   1. KPI strip — total forecast, total actuals (+ % consumed), open POs,
 *      total variance vs baseline.
 *   2. Vendor table — sortable summary of vendors with per-vendor row
 *      expansion to show category mix + spend split. Clicking a row in
 *      the category breakdown filters the vendor list down to that
 *      category.
 *   3. Category breakdown — per-cost-type rollup. Clicking a category
 *      drives the vendor-table filter (#2 above).
 *
 * Data via the new `externalCostsApi` wrapper (E2 endpoints, mounted by
 * T1 in Wave 5 per the cross-team plan).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { externalCostsApi } from '@/api/endpoints';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type {
  ProjectVendorSummaryRow,
  ProjectCategoryRollupRow,
} from '@/types/api';

interface Props {
  projectId: string;
}

type SortKey = 'vendor' | 'forecast' | 'actuals' | 'remaining' | 'variance';

export function ExternalCostsTab({ projectId }: Props) {
  const [vendors, setVendors] = useState<ProjectVendorSummaryRow[]>([]);
  const [categories, setCategories] = useState<ProjectCategoryRollupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('forecast');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      externalCostsApi.getProjectVendorSummary(projectId),
      externalCostsApi.getProjectCategoryRollup(projectId),
    ])
      .then(([vRes, cRes]) => {
        if (cancelled) return;
        setVendors(vRes.items);
        setCategories(cRes.items);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : 'Could not load external costs',
        );
        setVendors([]);
        setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // KPI rollup
  const kpis = useMemo(() => {
    const forecast = vendors.reduce((s, v) => s + v.forecast_total, 0);
    const actuals = vendors.reduce((s, v) => s + v.actuals_total, 0);
    const baseline = vendors.reduce((s, v) => s + v.baseline_total, 0);
    const pos = vendors.reduce((s, v) => s + v.po_count, 0);
    const variance = forecast - baseline;
    const consumedPct = forecast > 0 ? (actuals / forecast) * 100 : 0;
    return { forecast, actuals, baseline, pos, variance, consumedPct };
  }, [vendors]);

  // Filter + sort vendors
  const sortedVendors = useMemo(() => {
    const arr = categoryFilter
      ? vendors.filter((v) => v.expense_cost_type === categoryFilter)
      : vendors.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'vendor':
          return a.vendor_name.localeCompare(b.vendor_name) * dir;
        case 'forecast':
          return (a.forecast_total - b.forecast_total) * dir;
        case 'actuals':
          return (a.actuals_total - b.actuals_total) * dir;
        case 'remaining':
          return (a.remaining - b.remaining) * dir;
        case 'variance':
          return (a.variance - b.variance) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [vendors, sortKey, sortDir, categoryFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'vendor' ? 'asc' : 'desc');
    }
  }

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </Card>
    );
  }

  if (vendors.length === 0 && categories.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          No external cost data recorded for this project.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label="Forecast"
          value={formatCurrency(kpis.forecast)}
          hint={`${vendors.length} vendor${vendors.length === 1 ? '' : 's'}`}
        />
        <KPI
          label="Actuals YTD"
          value={formatCurrency(kpis.actuals)}
          hint={`${kpis.consumedPct.toFixed(1).replace('.', ',')}% consumed`}
        />
        <KPI
          label="Open POs"
          value={String(kpis.pos)}
          hint="Distinct purchase orders"
        />
        <KPI
          label="Variance vs baseline"
          value={formatCurrency(kpis.variance)}
          valueClass={
            kpis.variance > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400'
          }
        />
      </div>

      {/* Category breakdown */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            By cost category
          </h3>
          {categoryFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setCategoryFilter(null)}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear category filter
            </Button>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right w-32">Forecast</TableHead>
                <TableHead className="text-right w-32">Actuals</TableHead>
                <TableHead className="text-right w-32">Variance</TableHead>
                <TableHead className="text-right w-24">Vendors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => {
                const isActive = categoryFilter === c.cost_type_name;
                return (
                  <TableRow
                    key={c.cost_type_id}
                    className={cn(
                      'cursor-pointer',
                      isActive ? 'bg-accent' : 'hover:bg-accent/40',
                    )}
                    onClick={() =>
                      setCategoryFilter(
                        isActive ? null : c.cost_type_name,
                      )
                    }
                  >
                    <TableCell className="font-medium text-foreground">
                      {c.cost_type_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(c.forecast_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(c.actuals_total)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        c.variance > 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : c.variance < 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground',
                      )}
                    >
                      {formatCurrency(c.variance)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.vendor_count}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          Click a category row to filter the vendor list below.
        </p>
      </section>

      {/* Vendor table */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          By vendor
          {categoryFilter && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              filtered: {categoryFilter}
            </Badge>
          )}
        </h3>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <SortHead
                  current={sortKey}
                  dir={sortDir}
                  k="vendor"
                  toggle={toggleSort}
                  label="Vendor"
                />
                <TableHead>Cost type</TableHead>
                <SortHead
                  current={sortKey}
                  dir={sortDir}
                  k="forecast"
                  toggle={toggleSort}
                  label="Forecast"
                  align="right"
                />
                <SortHead
                  current={sortKey}
                  dir={sortDir}
                  k="actuals"
                  toggle={toggleSort}
                  label="Actuals"
                  align="right"
                />
                <SortHead
                  current={sortKey}
                  dir={sortDir}
                  k="remaining"
                  toggle={toggleSort}
                  label="Remaining"
                  align="right"
                />
                <SortHead
                  current={sortKey}
                  dir={sortDir}
                  k="variance"
                  toggle={toggleSort}
                  label="Variance"
                  align="right"
                />
                <TableHead className="text-right w-20">POs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVendors.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-xs text-muted-foreground py-8"
                  >
                    No vendors match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                sortedVendors.map((v) => {
                  const isOpen = expanded.has(v.vendor_name);
                  return (
                    <>
                      <TableRow
                        key={v.vendor_name}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => toggleExpand(v.vendor_name)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {v.vendor_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {v.expense_cost_type}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(v.forecast_total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(v.actuals_total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(v.remaining)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            v.variance > 0
                              ? 'text-amber-700 dark:text-amber-400'
                              : v.variance < 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-muted-foreground',
                          )}
                        >
                          {formatCurrency(v.variance)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.po_count}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow
                          key={`${v.vendor_name}-detail`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell colSpan={7} className="py-3">
                            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                              <div>
                                <dt className="text-muted-foreground">
                                  Baseline
                                </dt>
                                <dd className="tabular-nums text-foreground">
                                  {formatCurrency(v.baseline_total)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Lines
                                </dt>
                                <dd className="tabular-nums text-foreground">
                                  {v.line_count}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Consumed
                                </dt>
                                <dd className="tabular-nums text-foreground">
                                  {v.forecast_total > 0
                                    ? formatPercent(
                                        (v.actuals_total / v.forecast_total) *
                                          100,
                                      )
                                    : '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Variance vs baseline
                                </dt>
                                <dd className="tabular-nums text-foreground">
                                  {formatCurrency(v.variance)}
                                </dd>
                              </div>
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'text-lg font-semibold text-foreground tabular-nums',
            valueClass,
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SortHead({
  current,
  dir,
  k,
  toggle,
  label,
  align,
}: {
  current: SortKey;
  dir: 'asc' | 'desc';
  k: SortKey;
  toggle: (k: SortKey) => void;
  label: string;
  align?: 'right';
}) {
  const isActive = current === k;
  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none',
        align === 'right' && 'text-right',
      )}
      onClick={() => toggle(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-[10px] opacity-70">
            {dir === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </span>
    </TableHead>
  );
}
