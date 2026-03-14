import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { PortfolioKPIs } from '@/types/api';

interface Props {
  data: PortfolioKPIs | null;
}

function driftColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 5) return 'text-green-600';
  if (abs < 10) return 'text-amber-600';
  return 'text-red-600';
}

export function PortfolioKPIRow({ data }: Props) {
  if (!data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Baseline</p>
            <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.baseline)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Current Forecast</p>
            <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.current_forecast)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">YTD Actuals</p>
            <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.ytd_actuals)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Plan Drift</p>
            <p className={`text-lg font-semibold ${driftColor(data.plan_drift_pct)}`}>
              {formatCurrency(data.plan_drift_amount)}
            </p>
            <p className={`text-xs font-medium ${driftColor(data.plan_drift_pct)}`}>
              {formatPercent(data.plan_drift_pct)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Run / Change</p>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-800">
                Run: {formatCurrency(data.run_total)} ({data.run_pct}%)
              </p>
              <p className="text-sm font-semibold text-slate-800">
                Change: {formatCurrency(data.change_total)} ({data.change_pct}%)
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">CapEx / OpEx</p>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-800">
                CapEx: {formatCurrency(data.capex_total)} ({data.capex_pct}%)
              </p>
              <p className="text-sm font-semibold text-slate-800">
                OpEx: {formatCurrency(data.opex_total)} ({data.opex_pct}%)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
