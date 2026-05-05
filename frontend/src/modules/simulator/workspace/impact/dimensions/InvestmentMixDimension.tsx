/**
 * Dimension 6 — Investment mix.
 *
 * Distribution by hierarchy top-level node. Renders a stacked bar (anchor
 * vs scenario) for each node + a tabular delta column.
 *
 * Backend: `compute_investment_mix_dimension` returns items pre-sorted by
 * scenario_total descending.
 */

import { PieChart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { InvestmentMixDimensionData } from '../../../lib/impactTypes';
import { formatDeltaWithArrow } from '../../../lib/dimensionHeadlines';

interface InvestmentMixDimensionProps {
  data: InvestmentMixDimensionData | undefined;
}

export function InvestmentMixDimension({ data }: InvestmentMixDimensionProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No investment-mix data available.
      </p>
    );
  }

  if (!data.items.length) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <PieChart className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No portfolio mix changes detected.
        </p>
      </Card>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Hierarchy node</th>
            <th className="text-right px-3 py-2 font-medium">Anchor</th>
            <th className="text-right px-3 py-2 font-medium">Scenario</th>
            <th className="text-right px-3 py-2 font-medium">Anchor %</th>
            <th className="text-right px-3 py-2 font-medium">Scenario %</th>
            <th className="text-right px-3 py-2 font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((row) => (
            <tr key={row.node_id} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-foreground">
                {row.node_name}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {formatCurrency(row.anchor_total)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {formatCurrency(row.scenario_total)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {formatPercent(row.anchor_pct, { signed: false })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {formatPercent(row.scenario_pct, { signed: false })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                {row.delta === 0 ? '±€0' : formatDeltaWithArrow(row.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
