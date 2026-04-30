/**
 * Financial Detail section of the Portfolio Project Detail page per
 * [E-03d]. Read-only.
 *
 * Reuses Workbench/Cluster C surfaces in display-only mode:
 *   - `MixedGranularityGrid` (C2) with no comparison overlay
 *   - `ProjectTrajectoryChart` (existing v4 chart)
 *   - Three-point comparison panel
 *
 * T2's E4 variance waterfall is intentionally pluggable: this section
 * imports a placeholder slot, and once T2's `VarianceWaterfallChart` is
 * merged into `main` the import target is swapped in a follow-up commit
 * per the cross-team plan in `wave5-...-plan.md`.
 */
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { MixedGranularityGrid } from '@/modules/workbench/forecast/MixedGranularityGrid';
import { ProjectTrajectoryChart } from '@/components/charts/ProjectTrajectoryChart';
import { workbenchApi } from '@/api/endpoints';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { ProjectOverview } from '@/types/api';

interface Props {
  projectId: string;
  overview: ProjectOverview | null;
  loading: boolean;
}

export function FinancialDetailSection({ projectId, overview, loading }: Props) {
  // Build sub-category name map for the mixed-granularity grid (matches
  // the workbench ForecastTab pattern). Loaded once per project mount.
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    workbenchApi
      .getForecast(projectId)
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of res.items) {
          map[row.sub_category] = row.sub_category_name;
        }
        setNameMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Three-point comparison */}
      {overview?.three_point_comparison && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Three-point comparison
          </h3>
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <ThreePointCell
                label="Baseline"
                value={formatCurrency(overview.three_point_comparison.baseline)}
              />
              <ThreePointCell
                label="Forecast"
                value={formatCurrency(overview.three_point_comparison.forecast)}
              />
              <ThreePointCell
                label="Actuals"
                value={formatCurrency(overview.three_point_comparison.actuals)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border text-xs">
              <DerivedCell
                label="Plan drift"
                value={formatPercent(
                  overview.three_point_comparison.plan_drift_pct,
                )}
              />
              <DerivedCell
                label="Execution variance"
                value={formatCurrency(
                  overview.three_point_comparison.execution_variance,
                )}
              />
              <DerivedCell
                label="Total variance"
                value={formatCurrency(
                  overview.three_point_comparison.total_variance,
                )}
              />
            </div>
          </Card>
        </section>
      )}

      {/* Mixed-granularity forecast grid (read-only) */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Forecast grid · monthly + quarterly
        </h3>
        <MixedGranularityGrid
          projectId={projectId}
          nameMap={nameMap}
          deltaIndex={new Map()}
          comparisonActive={false}
        />
      </section>

      {/* Trajectory chart */}
      {overview?.trajectory_chart && overview.trajectory_chart.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Forecast trajectory
          </h3>
          <Card className="p-4">
            <ProjectTrajectoryChart data={overview.trajectory_chart} />
          </Card>
        </section>
      )}

      {/* Variance waterfall placeholder — T2's E4 chart slots in here when
          merged into main. Until then, we surface an explanatory card so
          the page layout is stable. */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Variance waterfall
        </h3>
        <Card className="p-4 border-dashed">
          <p className="text-xs text-muted-foreground">
            The variance waterfall lands with T2's E4 chart in this Wave 5
            cycle (cross-team integration commit). Once merged it renders
            here without further changes to this page.
          </p>
        </Card>
      </section>
    </div>
  );
}

function ThreePointCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

function DerivedCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-medium text-foreground tabular-nums">{value}</p>
    </div>
  );
}
