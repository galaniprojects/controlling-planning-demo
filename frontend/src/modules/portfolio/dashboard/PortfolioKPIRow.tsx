import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { PortfolioKPIs } from '@/types/api';

interface Props {
  data: PortfolioKPIs | null;
}

function driftColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 5) return 'text-green-600 dark:text-green-400';
  if (abs < 10) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function PortfolioKPIRow({ data }: Props) {
  if (!data) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="px-3 py-2.5 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* CY label */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">FY 2026</p>

      {/* Main KPI tiles — CY scoped */}
      <div className="flex flex-wrap gap-3">
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">Baseline</p>
            <p className="text-base font-semibold text-foreground">{formatCurrency(data.baseline)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">Current Forecast</p>
            <p className="text-base font-semibold text-foreground">{formatCurrency(data.current_forecast)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">YTD Actuals</p>
            <p className="text-base font-semibold text-foreground">{formatCurrency(data.ytd_actuals)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">Plan Drift</p>
            <p className={`text-base font-semibold ${driftColor(data.plan_drift_pct)}`}>
              {formatCurrency(data.plan_drift_amount)}
            </p>
            <p className={`text-[10px] font-medium ${driftColor(data.plan_drift_pct)}`}>
              {formatPercent(data.plan_drift_pct)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">Run / Change</p>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Run: {formatCurrency(data.run_total)} ({data.run_pct}%)
              </p>
              <p className="text-xs font-semibold text-foreground">
                Chg: {formatCurrency(data.change_total)} ({data.change_pct}%)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-2.5">
            <p className="text-[10px] text-muted-foreground mb-1">CapEx / OpEx</p>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                CapEx: {formatCurrency(data.capex_total)} ({data.capex_pct}%)
              </p>
              <p className="text-xs font-semibold text-foreground">
                OpEx: {formatCurrency(data.opex_total)} ({data.opex_pct}%)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lifetime summary — compact, subordinate styling */}
      {data.lifetime_baseline != null && (
        <div className="flex items-center gap-6 px-1 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Lifetime</span>
          <span>Baseline: <span className="font-medium text-muted-foreground">{formatCurrency(data.lifetime_baseline)}</span></span>
          <span>Forecast: <span className="font-medium text-muted-foreground">{formatCurrency(data.lifetime_forecast ?? 0)}</span></span>
          <span>Actuals: <span className="font-medium text-muted-foreground">{formatCurrency(data.lifetime_actuals ?? 0)}</span></span>
          <span>Active Projects: <span className="font-medium text-muted-foreground">{data.active_project_count ?? 0}</span></span>
        </div>
      )}
    </div>
  );
}
