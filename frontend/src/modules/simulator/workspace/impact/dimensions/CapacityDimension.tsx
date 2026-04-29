/**
 * Dimension 3 — Capacity impact.
 *
 * Backend `compute_capacity_dimension` returns per-cost-centre buckets with
 * max anchor/scenario utilisation and total FTE delta. We render a sortable
 * table with a small bar chart per row showing scenario vs anchor headline.
 *
 * Directional indicators: arrows + +/- prefixes. CC rows over 100% get a
 * subtle background tint (semantic — capacity overrun) per CLAUDE.md
 * dark-mode rules.
 */

import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/formatters';
import type { CapacityDimensionData } from '../../../lib/impactTypes';

interface CapacityDimensionProps {
  data: CapacityDimensionData | undefined;
}

function UtilizationBar({
  pct,
  label,
}: {
  pct: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(150, pct));
  const widthPct = (clamped / 150) * 100;
  const overflow = pct > 100;
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <span className="text-[11px] text-muted-foreground w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={[
            'h-full',
            overflow
              ? 'bg-amber-500 dark:bg-amber-400'
              : 'bg-blue-500 dark:bg-blue-400',
          ].join(' ')}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-foreground w-12 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export function CapacityDimension({ data }: CapacityDimensionProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No capacity data for this scenario.
      </p>
    );
  }

  if (!data.cost_centers.length) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No capacity changes. All cost centres remain within their existing
          utilisation profile.
        </p>
      </Card>
    );
  }

  // Sort: over-100 rows first, then by absolute fte delta desc.
  const sorted = [...data.cost_centers].sort((a, b) => {
    const aOver = a.max_adjusted >= 100 ? 1 : 0;
    const bOver = b.max_adjusted >= 100 ? 1 : 0;
    if (aOver !== bOver) return bOver - aOver;
    return Math.abs(b.fte_delta_total) - Math.abs(a.fte_delta_total);
  });

  return (
    <div className="space-y-3">
      {data.over_100_count > 0 && (
        <Card className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold">{data.over_100_count}</span> cost
            centre{data.over_100_count === 1 ? '' : 's'} exceed 100%
            utilisation under this scenario.
          </p>
        </Card>
      )}

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Cost centre</th>
              <th className="text-left px-3 py-2 font-medium">Anchor max</th>
              <th className="text-left px-3 py-2 font-medium">Scenario max</th>
              <th className="text-right px-3 py-2 font-medium">FTE Δ</th>
              <th className="text-right px-3 py-2 font-medium">Months</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const over = row.max_adjusted >= 100;
              return (
                <tr
                  key={row.cost_center_id}
                  className={[
                    'border-t border-border',
                    over
                      ? 'bg-amber-50/50 dark:bg-amber-950/20'
                      : '',
                  ].join(' ')}
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {row.cost_center_id}
                  </td>
                  <td className="px-3 py-2">
                    <UtilizationBar pct={row.max_original} label="Anchor" />
                  </td>
                  <td className="px-3 py-2">
                    <UtilizationBar pct={row.max_adjusted} label="Scenario" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                    {row.fte_delta_total === 0
                      ? '±0'
                      : `${row.fte_delta_total > 0 ? '+' : ''}${row.fte_delta_total.toFixed(2).replace('.', ',')}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.month_count)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
