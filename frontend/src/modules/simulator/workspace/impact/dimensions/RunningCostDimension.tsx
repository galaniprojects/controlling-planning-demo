/**
 * Dimension 7 — Running cost / long-term sustainability.
 *
 * Shows the time-frame breakdown (CY / NY / Out / Overall) the engine
 * already computes for Operate-stage projects. Each row is anchor vs
 * scenario with delta. Same shape as Financial dimension's breakdown but
 * focused specifically on the running-cost tail.
 */

import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatCurrencyDelta } from '@/lib/formatters';
import type { RunningCostDimensionData } from '../../../lib/impactTypes';

interface RunningCostDimensionProps {
  data: RunningCostDimensionData | undefined;
}

export function RunningCostDimension({ data }: RunningCostDimensionProps) {
  if (!data || !data.time_frame_breakdown.length) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No long-term cost-tail breakdown available for this scenario.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Long-term sustainability — running cost tail for Operate-stage
        projects (CY = current year, NY = next year, Out = beyond two-year
        horizon).
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
                  {row.delta === 0 ? '±€0' : formatCurrencyDelta(row.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
