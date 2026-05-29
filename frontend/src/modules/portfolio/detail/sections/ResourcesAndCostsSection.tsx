/**
 * Resources & Costs section of the Portfolio Project Detail page per
 * [E-03e]. Read-only.
 *
 * Section A — Resource plan: reuses `ResourceSummaryTable` from the
 * Workbench overview and the resource plan summary already returned by
 * `workbenchApi.getOverview`.
 *
 * Section B — External costs: vendor + category summary tables backed
 * by the E2 endpoints
 *   - GET /api/projects/{id}/external-costs/vendor-summary
 *   - GET /api/projects/{id}/external-costs/category-rollup
 * (typed wrappers added in `endpoints.ts` under `externalCostsApi` as
 * part of E5; this section consumes the same wrapper, so once E5 lands
 * in this branch the import target stays the same).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { ResourceSummaryTable } from '@/modules/workbench/overview/ResourceSummaryTable';
import { externalCostsApi } from '@/api/endpoints';
import { formatCurrency, formatCurrencyDetailed } from '@/lib/formatters';
import { stageDisplayLabel } from '@/lib/pipelineStages';
import type {
  ProjectOverview,
  ProjectSummary,
  ProjectVendorSummaryRow,
  ProjectCategoryRollupRow,
} from '@/types/api';

interface Props {
  projectId: string;
  summary: ProjectSummary | null;
  overview: ProjectOverview | null;
  loading: boolean;
}

export function ResourcesAndCostsSection({
  projectId,
  summary,
  overview,
  loading,
}: Props) {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<ProjectVendorSummaryRow[]>([]);
  const [categories, setCategories] = useState<ProjectCategoryRollupRow[]>([]);
  const [extLoading, setExtLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setExtLoading(true);
    Promise.all([
      externalCostsApi.getProjectVendorSummary(projectId).catch(() => ({
        items: [] as ProjectVendorSummaryRow[],
      })),
      externalCostsApi.getProjectCategoryRollup(projectId).catch(() => ({
        items: [] as ProjectCategoryRollupRow[],
      })),
    ])
      .then(([vRes, cRes]) => {
        if (cancelled) return;
        setVendors(vRes.items);
        setCategories(cRes.items);
      })
      .finally(() => {
        if (!cancelled) setExtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const runEntity = summary?.run_entity ?? null;

  return (
    <div className="space-y-4">
      {/* Continuing cost — present only for projects handed over to a Run
          entity (Offering / InternalService) per VIPER §7.2. */}
      {runEntity && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Continuing cost
          </h3>
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1 min-w-0">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {stageDisplayLabel('Run entity spawned')}
                </span>
                <p className="text-sm font-medium text-foreground truncate">
                  {runEntity.name}
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {runEntity.identifier}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Ongoing run cost is tracked against the linked Run entity.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `/workbench?entity=${encodeURIComponent(runEntity.id)}`,
                  )
                }
              >
                Open Run entity
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Annual cost</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {runEntity.annual_cost !== null
                    ? formatCurrency(runEntity.annual_cost)
                    : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {summary?.handover_year != null
                    ? `Cumulative since ${summary.handover_year}`
                    : 'Cumulative since handover'}
                </p>
                <p className="text-lg font-semibold text-foreground tabular-nums">
                  {summary?.cumulative_since_handover != null
                    ? formatCurrencyDetailed(summary.cumulative_since_handover)
                    : '—'}
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Resource plan */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Resource plan</h3>
        {overview?.resource_plan_summary &&
        overview.resource_plan_summary.length > 0 ? (
          <ResourceSummaryTable
            title={overview.resource_plan_title}
            items={overview.resource_plan_summary}
          />
        ) : (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              No resource plan rows recorded for this project.
            </p>
          </Card>
        )}
      </section>

      {/* External cost categories */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          External cost categories
        </h3>
        {extLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : categories.length === 0 ? (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              No external cost categories found for this project.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right w-32">Forecast</TableHead>
                  <TableHead className="text-right w-32">Baseline</TableHead>
                  <TableHead className="text-right w-32">Actuals</TableHead>
                  <TableHead className="text-right w-24">Vendors</TableHead>
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
                      {formatCurrency(c.baseline_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(c.actuals_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.vendor_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {/* External cost vendors */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          External cost vendors
        </h3>
        {extLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : vendors.length === 0 ? (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              No vendor lines recorded for this project.
            </p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Cost type</TableHead>
                  <TableHead className="text-right w-32">Forecast</TableHead>
                  <TableHead className="text-right w-32">Actuals</TableHead>
                  <TableHead className="text-right w-32">Remaining</TableHead>
                  <TableHead className="text-right w-24">POs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.slice(0, 10).map((v) => (
                  <TableRow key={v.vendor_name}>
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
                    <TableCell className="text-right tabular-nums">
                      {v.po_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {vendors.length > 10 && (
              <p className="px-4 py-2 text-[10px] text-muted-foreground italic border-t border-border">
                Showing top 10 of {vendors.length} vendors. Open the
                Workbench's External Costs tab for the full list.
              </p>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
