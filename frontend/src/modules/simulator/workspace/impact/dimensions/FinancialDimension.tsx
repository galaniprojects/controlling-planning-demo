/**
 * Dimension 1 — Financial impact.
 *
 * Renders:
 *   - Headline cards: Total budget (anchor / scenario / delta).
 *   - CapEx vs OpEx breakdown.
 *   - Time-frame breakdown (CY / NY / Out / Overall) per spec line 1052.
 *
 * Directional indicators use arrows + +/- prefixes (NOT colour) per CLAUDE.md.
 */

import { formatCurrency, formatCurrencyDelta, formatPercent } from '@/lib/formatters';
import { Card } from '@/components/ui/card';
import type { FinancialDimensionData } from '../../../lib/impactTypes';
import { formatDeltaWithArrow } from '../../../lib/dimensionHeadlines';

interface FinancialDimensionProps {
  data: FinancialDimensionData | undefined;
}

function KPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="px-4 py-3 bg-card">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </Card>
  );
}

export function FinancialDimension({ data }: FinancialDimensionProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No financial data available for this scenario.
      </p>
    );
  }

  const anchor = data.total_anchor ?? data.total_original;
  const pct = anchor && anchor !== 0 ? (data.total_delta / anchor) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI
          label="Anchor total"
          value={formatCurrency(anchor)}
          sub={
            data.total_anchor === null
              ? 'Anchor unset — using original'
              : 'Forecast version baseline'
          }
        />
        <KPI
          label="Scenario total"
          value={formatCurrency(data.total_adjusted)}
          sub="After scenario actions"
        />
        <KPI
          label="Delta"
          value={formatDeltaWithArrow(data.total_delta)}
          sub={
            pct === 0
              ? 'No change'
              : `${formatPercent(pct)} vs anchor`
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            CapEx
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {formatCurrency(data.capex.original)} →{' '}
              {formatCurrency(data.capex.adjusted)}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatDeltaWithArrow(data.capex.delta)}
            </span>
          </div>
        </Card>
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            OpEx
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {formatCurrency(data.opex.original)} →{' '}
              {formatCurrency(data.opex.adjusted)}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatDeltaWithArrow(data.opex.delta)}
            </span>
          </div>
        </Card>
      </div>

      {data.time_frame_breakdown.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Time-frame breakdown
          </p>
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Horizon</th>
                  <th className="text-right px-3 py-2 font-medium">Anchor</th>
                  <th className="text-right px-3 py-2 font-medium">Scenario</th>
                  <th className="text-right px-3 py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {data.time_frame_breakdown.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatCurrency(row.original)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {formatCurrency(row.adjusted)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                      {row.delta === 0
                        ? '±€0'
                        : formatCurrencyDelta(row.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
