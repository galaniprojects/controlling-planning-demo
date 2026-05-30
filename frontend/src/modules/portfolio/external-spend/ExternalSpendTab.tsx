/**
 * Portfolio External Spend tab per [E-08c..d].
 *
 * Sections:
 *   1. KPI strip — total forecast, total actuals (+ % consumed),
 *      vendor count, project count.
 *   2. Cross-project vendor summary — sortable, expandable per-project
 *      breakdown using the cross-tab matrix as the data source for the
 *      expansion rows.
 *   3. Category analysis — % of total external spend per cost type plus
 *      per-cost-type cumulative project + vendor counts.
 *   4. Project × vendor matrix — collapsed by default to keep the page
 *      light; click to expand. Forecast-only cells (omits actuals).
 *
 * Backed by `externalCostsApi.getPortfolioVendorSummary`,
 * `getPortfolioCategoryAnalysis`, and
 * `getPortfolioProjectVendorMatrix` (E2 endpoints, T1-owned wrapper).
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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { externalCostsApi } from '@/api/endpoints';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type {
  PortfolioVendorSummaryRow,
  PortfolioCategoryAnalysisRow,
  ProjectVendorMatrixResponse,
} from '@/types/api';

type SortKey = 'vendor' | 'forecast' | 'actuals' | 'projects';

interface ExternalSpendTabProps {
  /**
   * Which portfolio the external spend is scoped to. `'change'` (default)
   * hits the Change `/portfolio/external-costs/*` endpoints; `'run'` swaps to
   * the Run `/portfolio/run/external-costs/*` endpoints (VIPER Wave 5 §10).
   * Default keeps existing Change behaviour untouched.
   */
  scope?: 'change' | 'run';
}

export function ExternalSpendTab({ scope = 'change' }: ExternalSpendTabProps = {}) {
  const [vendors, setVendors] = useState<PortfolioVendorSummaryRow[]>([]);
  const [categories, setCategories] = useState<PortfolioCategoryAnalysisRow[]>(
    [],
  );
  const [matrix, setMatrix] = useState<ProjectVendorMatrixResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('forecast');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fns =
      scope === 'run'
        ? {
            vendor: externalCostsApi.getRunVendorSummary,
            category: externalCostsApi.getRunCategoryAnalysis,
            matrix: externalCostsApi.getRunProjectVendorMatrix,
          }
        : {
            vendor: externalCostsApi.getPortfolioVendorSummary,
            category: externalCostsApi.getPortfolioCategoryAnalysis,
            matrix: externalCostsApi.getPortfolioProjectVendorMatrix,
          };
    Promise.all([fns.vendor(), fns.category(), fns.matrix()])
      .then(([vRes, cRes, mRes]) => {
        if (cancelled) return;
        setVendors(vRes.items);
        setCategories(cRes.items);
        setMatrix(mRes);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load portfolio external spend',
        );
        setVendors([]);
        setCategories([]);
        setMatrix(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const kpis = useMemo(() => {
    const forecast = vendors.reduce((s, v) => s + v.forecast_total, 0);
    const actuals = vendors.reduce((s, v) => s + v.actuals_total, 0);
    const projectIds = new Set<string>();
    for (const v of vendors) {
      if (v.top_project_id) projectIds.add(v.top_project_id);
    }
    return {
      forecast,
      actuals,
      consumedPct: forecast > 0 ? (actuals / forecast) * 100 : 0,
      vendorCount: vendors.length,
      projectCount: matrix?.projects.length ?? projectIds.size,
    };
  }, [vendors, matrix]);

  const sortedVendors = useMemo(() => {
    const arr = vendors.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'vendor':
          return a.vendor_name.localeCompare(b.vendor_name) * dir;
        case 'forecast':
          return (a.forecast_total - b.forecast_total) * dir;
        case 'actuals':
          return (a.actuals_total - b.actuals_total) * dir;
        case 'projects':
          return (a.project_count - b.project_count) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [vendors, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'vendor' ? 'asc' : 'desc');
    }
  }

  function findMatrixCell(projectId: string, vendorName: string) {
    if (!matrix) return null;
    return matrix.cells.find(
      (c) => c.project_id === projectId && c.vendor_name === vendorName,
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
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

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label="Total forecast"
          value={formatCurrency(kpis.forecast)}
          hint={`${kpis.vendorCount} vendor${kpis.vendorCount === 1 ? '' : 's'}`}
        />
        <KPI
          label="Actuals YTD"
          value={formatCurrency(kpis.actuals)}
          hint={`${formatPercent(kpis.consumedPct, { signed: false })} consumed`}
        />
        <KPI label="Vendors" value={String(kpis.vendorCount)} />
        <KPI label="Projects" value={String(kpis.projectCount)} />
      </div>

      {/* Cross-project vendor summary */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Cross-project vendor summary
        </h3>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <SortHead
                  k="vendor"
                  current={sortKey}
                  dir={sortDir}
                  toggle={toggleSort}
                  label="Vendor"
                />
                <TableHead>Cost type</TableHead>
                <SortHead
                  k="projects"
                  current={sortKey}
                  dir={sortDir}
                  toggle={toggleSort}
                  label="Projects"
                  align="right"
                />
                <SortHead
                  k="forecast"
                  current={sortKey}
                  dir={sortDir}
                  toggle={toggleSort}
                  label="Forecast"
                  align="right"
                />
                <SortHead
                  k="actuals"
                  current={sortKey}
                  dir={sortDir}
                  toggle={toggleSort}
                  label="Actuals"
                  align="right"
                />
                <TableHead>Top project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVendors.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-xs text-muted-foreground py-8"
                  >
                    No vendor data in scope.
                  </TableCell>
                </TableRow>
              ) : (
                sortedVendors.map((v) => {
                  const isOpen = expandedVendor === v.vendor_name;
                  const projectsForVendor =
                    matrix?.projects.filter((p) =>
                      matrix.cells.some(
                        (c) =>
                          c.vendor_name === v.vendor_name &&
                          c.project_id === p.id,
                      ),
                    ) ?? [];
                  return (
                    <Fragment key={v.vendor_name}>
                      <TableRow
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() =>
                          setExpandedVendor(isOpen ? null : v.vendor_name)
                        }
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
                          {v.project_count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(v.forecast_total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(v.actuals_total)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {v.top_project_name ?? '—'}{' '}
                          <span className="opacity-60">
                            ({formatCurrency(v.top_project_amount)})
                          </span>
                        </TableCell>
                      </TableRow>
                      {isOpen && projectsForVendor.length > 0 && (
                        <TableRow
                          key={`${v.vendor_name}-detail`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell colSpan={6} className="py-3">
                            <div className="space-y-1">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Project breakdown
                              </p>
                              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                                {projectsForVendor.map((p) => {
                                  const cell = findMatrixCell(
                                    p.id,
                                    v.vendor_name,
                                  );
                                  if (!cell) return null;
                                  return (
                                    <li
                                      key={p.id}
                                      className="flex items-baseline justify-between gap-2"
                                    >
                                      <span className="text-foreground truncate">
                                        {p.name}
                                      </span>
                                      <span className="font-mono tabular-nums text-muted-foreground">
                                        {formatCurrency(cell.forecast_total)}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Category analysis */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Category analysis
        </h3>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cost type</TableHead>
                <TableHead className="text-right w-28">Forecast</TableHead>
                <TableHead className="text-right w-28">Actuals</TableHead>
                <TableHead className="text-right w-24">Projects</TableHead>
                <TableHead className="text-right w-24">Vendors</TableHead>
                <TableHead className="text-right w-24">% of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.cost_type_id}>
                  <TableCell className="font-medium text-foreground">
                    {c.cost_type_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(c.forecast_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(c.actuals_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.project_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.vendor_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(c.pct_of_external_total, { signed: false })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Project x vendor matrix (collapsed by default) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Project × vendor matrix
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMatrixOpen((v) => !v)}
          >
            {matrixOpen ? (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
        {matrixOpen && matrix && matrix.vendors.length > 0 ? (
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card min-w-[200px]">
                    Project
                  </TableHead>
                  {matrix.vendors.slice(0, 12).map((v) => (
                    <TableHead
                      key={v.name}
                      className="text-right whitespace-nowrap"
                    >
                      {v.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Row total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="sticky left-0 bg-card font-medium text-foreground">
                      {p.name}
                    </TableCell>
                    {matrix.vendors.slice(0, 12).map((v) => {
                      const cell = matrix.cells.find(
                        (c) =>
                          c.project_id === p.id && c.vendor_name === v.name,
                      );
                      const value = cell?.forecast_total ?? 0;
                      return (
                        <TableCell
                          key={v.name}
                          className={cn(
                            'text-right tabular-nums',
                            value === 0
                              ? 'text-muted-foreground/40'
                              : 'text-foreground',
                          )}
                        >
                          {value > 0 ? formatCurrency(value) : '—'}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(p.row_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {matrix.vendors.length > 12 && (
              <p className="px-4 py-2 text-[10px] text-muted-foreground italic border-t border-border">
                Matrix capped at first 12 vendors by spend; full data in the
                Reporting module.
              </p>
            )}
          </Card>
        ) : matrixOpen ? (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              No project × vendor data in scope.
            </p>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-semibold text-foreground tabular-nums">
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
  k,
  current,
  dir,
  toggle,
  label,
  align,
}: {
  k: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
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
