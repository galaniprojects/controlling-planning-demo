import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { PortfolioKPIs } from '@/types/api';

interface Props {
  data: PortfolioKPIs | null;
}

export function PortfolioKPIRow({ data }: Props) {
  if (!data) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const capexPct = data.capex_opex_split.capex + data.capex_opex_split.opex > 0
    ? Math.round((data.capex_opex_split.capex / (data.capex_opex_split.capex + data.capex_opex_split.opex)) * 100)
    : 0;
  const opexPct = 100 - capexPct;

  const kpis = [
    { label: 'Total Budget', value: formatCurrency(data.total_budget) },
    { label: 'YTD Spend', value: formatCurrency(data.ytd_spend) },
    { label: 'Forecast at Completion', value: formatCurrency(data.forecast_at_completion) },
    { label: 'Overall Variance', value: formatPercent(data.overall_variance_pct) },
    { label: 'CapEx / OpEx', value: `${capexPct}% / ${opexPct}%` },
    { label: 'Run / Change', value: data.run_change_ratio },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
            <p className="text-lg font-semibold text-slate-800">{kpi.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
