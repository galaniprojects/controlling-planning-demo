/**
 * Overview section of the Portfolio Project Detail page per [E-03c].
 *
 * Read-only summary of the project's headline figures: budget snapshot,
 * timeline, three-point comparison, capex/opex split, resource plan
 * preview, and last-CR narrative. All data is read directly from the
 * existing `portfolioApi.getProjectSummary` + `workbenchApi.getOverview`
 * payloads — no new endpoints needed.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ProjectOverview, ProjectSummary } from '@/types/api';

interface Props {
  projectId: string;
  summary: ProjectSummary | null;
  overview: ProjectOverview | null;
  loading: boolean;
}

const DEMO_DATE = new Date('2026-04-01');

function timelinePct(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start + '-01').getTime();
  const e = new Date(end + '-01').getTime();
  if (e <= s) return 0;
  const total = e - s;
  const elapsed = DEMO_DATE.getTime() - s;
  return Math.max(0, Math.min(100, (elapsed / total) * 100));
}

export function OverviewSection({ projectId, summary, overview, loading }: Props) {
  void projectId;
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!summary && !overview) {
    return (
      <p className="text-sm text-muted-foreground">
        Project overview unavailable.
      </p>
    );
  }

  const bs = summary?.budget_snapshot;
  const tl = summary?.timeline;
  const tlPct = timelinePct(tl?.start ?? null, tl?.end ?? null);
  const meta = overview?.metadata;
  const capexOpex = overview?.capex_opex;
  const resPlan = overview?.resource_plan_summary ?? [];
  const tpc = overview?.three_point_comparison;

  return (
    <div className="space-y-4">
      {/* Budget snapshot */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Budget snapshot</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SnapshotCard label="Baseline" value={bs ? formatCurrency(bs.baseline) : '—'} />
          <SnapshotCard label="Forecast" value={bs ? formatCurrency(bs.forecast) : '—'} />
          <SnapshotCard
            label="Actuals YTD"
            value={bs ? formatCurrency(bs.actuals_ytd) : '—'}
          />
          <SnapshotCard
            label="Plan drift"
            value={bs ? formatPercent(bs.plan_drift_pct) : '—'}
            valueClass={
              bs && bs.plan_drift_pct > 10
                ? 'text-red-600 dark:text-red-400'
                : bs && bs.plan_drift_pct > 5
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-green-600 dark:text-green-400'
            }
          />
        </div>
      </section>

      {/* Timeline + status */}
      {tl?.start && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Timeline</h3>
          <Card className="p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-mono">{tl.start}</span>
              <span className="font-mono">{tl.end ?? '?'}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${tlPct}%` }}
              />
            </div>
            {meta?.status && (
              <p className="text-xs text-muted-foreground">
                Status: <span className="font-medium text-foreground">{meta.status}</span>
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Three-point summary */}
      {tpc && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            Three-point comparison
          </h3>
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <ThreePointTile label="Baseline" value={tpc.baseline} />
              <ThreePointTile label="Forecast" value={tpc.forecast} />
              <ThreePointTile label="Actuals" value={tpc.actuals} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border">
              <DerivedTile
                label="Plan drift"
                value={formatPercent(tpc.plan_drift_pct)}
              />
              <DerivedTile
                label="Execution variance"
                value={formatCurrency(tpc.execution_variance)}
              />
              <DerivedTile
                label="Total variance"
                value={formatCurrency(tpc.total_variance)}
              />
            </div>
          </Card>
        </section>
      )}

      {/* Capex / Opex + Resource plan */}
      {(capexOpex || resPlan.length > 0) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {capexOpex && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Cost mix · {capexOpex.type ?? 'mixed'}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="text-muted-foreground">CAPEX</div>
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {capexOpex.capex_amount !== undefined
                      ? formatCurrency(capexOpex.capex_amount)
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {capexOpex.capex_pct !== undefined
                      ? formatPercent(capexOpex.capex_pct)
                      : ''}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-muted-foreground">OPEX</div>
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {capexOpex.opex_amount !== undefined
                      ? formatCurrency(capexOpex.opex_amount)
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {capexOpex.opex_pct !== undefined
                      ? formatPercent(capexOpex.opex_pct)
                      : ''}
                  </div>
                </div>
              </div>
            </Card>
          )}
          {resPlan.length > 0 && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Resource plan summary
              </h3>
              <ul className="space-y-1.5 text-xs">
                {resPlan.slice(0, 6).map((row) => (
                  <li
                    key={row.role_id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-foreground truncate">
                      {row.role_name}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {row.total_hours.toLocaleString('de-DE')} h
                    </span>
                  </li>
                ))}
                {resPlan.length > 6 && (
                  <li className="text-[10px] text-muted-foreground italic">
                    + {resPlan.length - 6} more roles
                  </li>
                )}
              </ul>
            </Card>
          )}
        </section>
      )}

      {/* Last CR + sparkline */}
      {(summary?.last_cr_summary || (summary?.forecast_sparkline.length ?? 0) > 0) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {summary?.last_cr_summary && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                Last change request
              </h3>
              <p className="text-sm text-muted-foreground">
                {summary.last_cr_summary}
              </p>
            </Card>
          )}
          {summary && summary.forecast_sparkline.length > 0 && (
            <Card className="p-4 space-y-2">
              <h3 className="text-sm font-medium text-foreground">Forecast trend</h3>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={summary.forecast_sparkline}>
                  <Tooltip
                    formatter={(value) =>
                      [formatCurrency(Number(value ?? 0)), 'Forecast'] as [string, string]
                    }
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      color: 'var(--card-foreground)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.15)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function SnapshotCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
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
            'text-sm font-semibold text-foreground tabular-nums',
            valueClass,
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ThreePointTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold text-foreground tabular-nums">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function DerivedTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
    </div>
  );
}
