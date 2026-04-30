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
import { Card } from '@/components/ui/card';
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
import { formatCurrency } from '@/lib/formatters';
import type {
  ProjectOverview,
  ProjectVendorSummaryRow,
  ProjectCategoryRollupRow,
} from '@/types/api';

interface Props {
  projectId: string;
  overview: ProjectOverview | null;
  loading: boolean;
}

export function ResourcesAndCostsSection({
  projectId,
  overview,
  loading,
}: Props) {
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

  return (
    <div className="space-y-4">
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
