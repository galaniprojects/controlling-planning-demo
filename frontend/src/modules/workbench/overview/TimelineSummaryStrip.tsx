import type { TimelineSummary } from '@/types/api';
import { formatCurrency, formatPercent } from '@/lib/formatters';

interface Props {
  summary: TimelineSummary;
}

const ITEMS: { key: keyof TimelineSummary; label: string; format: 'currency' | 'percent' }[] = [
  { key: 'baseline_total', label: 'Baseline', format: 'currency' },
  { key: 'forecast_total', label: 'Forecast', format: 'currency' },
  { key: 'ytd_actuals', label: 'YTD Actuals', format: 'currency' },
  { key: 'plan_drift', label: 'Plan Drift', format: 'percent' },
  { key: 'execution_variance', label: 'Exec. Variance', format: 'percent' },
];

export function TimelineSummaryStrip({ summary }: Props) {
  return (
    <div className="flex items-center gap-6 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
      {ITEMS.map((item) => {
        const value = summary[item.key];
        return (
          <div key={item.key} className="text-center">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
              {item.label}
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {item.format === 'currency'
                ? formatCurrency(value)
                : formatPercent(value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
