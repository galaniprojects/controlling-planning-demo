import { Card } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { PortfolioKPISummary } from '@/types/api';

interface Props {
  kpis: PortfolioKPISummary;
}

export function KPIStrip({ kpis }: Props) {
  const items = [
    { label: 'Total IT Budget', value: formatCurrency(kpis.total_budget) },
    { label: 'YTD Spend', value: formatCurrency(kpis.ytd_spend) },
    { label: 'Portfolio Variance', value: formatPercent(kpis.portfolio_variance_pct) },
    { label: 'Overall Utilization', value: `${kpis.overall_utilization_pct.toFixed(0)}%` },
    { label: 'Run / Change', value: kpis.run_change_ratio },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} className="p-4 text-center">
          <p className="text-xs text-slate-500">{item.label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}
