/**
 * KPI strip for the Workbench External Costs tab.
 *
 * v5.1 C-09 lead pre-work — extracted from `ExternalCostsTab.tsx` so
 * Teammate A can extend the strip with the 2 new KPIs (Remaining Not
 * Invoiced, Accruals) without touching the tab's data-fetch / state
 * orchestration.
 *
 * Reads values from the backend-derived `kpis` block when present; falls
 * back to per-vendor row sums (the Wave 4 behaviour) when the block is
 * absent — keeps the component compatible during the lead pre-work
 * commit, before Teammate C populates the real KPI math.
 */
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type {
  ExternalCostsKpis,
  ProjectVendorSummaryRow,
} from '@/types/api';

interface Props {
  vendors: ProjectVendorSummaryRow[];
  kpis?: ExternalCostsKpis | null;
}

export function ExternalCostsKPIStrip({ vendors, kpis }: Props) {
  // Derive fallback rollups from the per-vendor rows so the strip renders
  // sensibly even when the backend hasn't yet populated `kpis` (lead
  // pre-work returns zero-filled values; Teammate C wires the real math).
  const forecast = kpis?.total_forecast
    ?? vendors.reduce((s, v) => s + v.forecast_total, 0);
  const actuals = kpis?.actuals_ytd
    ?? vendors.reduce((s, v) => s + v.actuals_total, 0);
  const variance = kpis?.variance_vs_baseline
    ?? forecast - vendors.reduce((s, v) => s + v.baseline_total, 0);
  const pos = vendors.reduce((s, v) => s + v.po_count, 0);
  const consumedPct = forecast > 0 ? (actuals / forecast) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPI
        label="Forecast"
        value={formatCurrency(forecast)}
        hint={`${vendors.length} vendor${vendors.length === 1 ? '' : 's'}`}
      />
      <KPI
        label="Actuals YTD"
        value={formatCurrency(actuals)}
        hint={`${formatPercent(consumedPct, { signed: false })} consumed`}
      />
      <KPI
        label="Open POs"
        value={String(pos)}
        hint="Distinct purchase orders"
      />
      <KPI
        label="Variance vs baseline"
        value={formatCurrency(variance)}
        valueClass={
          variance > 0
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-emerald-600 dark:text-emerald-400'
        }
      />
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
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
            'text-lg font-semibold text-foreground tabular-nums',
            valueClass,
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
