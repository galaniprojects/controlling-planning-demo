/**
 * Cost-allocation dimension (Lever-12 overlay) per [F-RV-01..06] +
 * spec acceptance criterion #10:
 *
 *   "Cost allocation impact preview renders per-location deltas."
 *
 * Backend `compute_cost_allocation_impact` returns the per-(entity,
 * charging-location) anchor vs scenario amounts plus a totals row.
 * Items are already filtered to non-zero deltas by the backend.
 *
 * This is the primary read-out for the Stage-1 distribution + Stage-2 BTC
 * sandbox edits. Each row shows the entity, its destination charging
 * location code, the anchor amount, the scenario amount, and the delta.
 */

import { Route } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LocationLabel } from '@/components/shared/LocationLabel';
import { formatCurrency } from '@/lib/formatters';
import type { CostAllocationDimensionData } from '../../../lib/impactTypes';
import { formatDeltaWithArrow } from '../../../lib/dimensionHeadlines';

interface CostAllocationDimensionProps {
  data: CostAllocationDimensionData | undefined;
}

export function CostAllocationDimension({
  data,
}: CostAllocationDimensionProps) {
  if (!data) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <Route className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Cost-allocation overlay not available for this scenario. Apply a
          Lever 12 (distribution / BTC) edit to populate this view.
        </p>
      </Card>
    );
  }

  if (data.error) {
    return (
      <Card className="px-4 py-3 bg-destructive/10 border-destructive/30">
        <p className="text-sm text-destructive font-medium">
          Cost-allocation calculation failed
        </p>
        <p className="text-xs text-muted-foreground mt-1 break-all">
          {data.error}
        </p>
      </Card>
    );
  }

  if (data.touched_entity_count === 0 || !data.items.length) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <Route className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No cost-allocation changes — Stage 1 distribution and Stage 2 BTC
          inputs are unchanged.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Anchor total
          </p>
          <p className="text-base font-semibold text-foreground mt-1 tabular-nums">
            {formatCurrency(data.totals.anchor_total)}
          </p>
        </Card>
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Scenario total
          </p>
          <p className="text-base font-semibold text-foreground mt-1 tabular-nums">
            {formatCurrency(data.totals.scenario_total)}
          </p>
        </Card>
        <Card className="px-4 py-3 bg-card">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Delta — {data.touched_entity_count} entity·ies
          </p>
          <p className="text-base font-semibold text-foreground mt-1 tabular-nums">
            {data.totals.delta === 0
              ? '±€0'
              : formatDeltaWithArrow(data.totals.delta)}
          </p>
        </Card>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Entity</th>
              <th className="text-left px-3 py-2 font-medium">
                <LocationLabel kind="charging" text="Location" />
              </th>
              <th className="text-right px-3 py-2 font-medium">Anchor</th>
              <th className="text-right px-3 py-2 font-medium">Scenario</th>
              <th className="text-right px-3 py-2 font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row, i) => (
              <tr
                key={`${row.entity_id}-${row.charging_location_id}-${i}`}
                className="border-t border-border"
              >
                <td className="px-3 py-2 font-medium text-foreground">
                  {row.entity_name}
                </td>
                <td className="px-3 py-2 text-foreground tabular-nums">
                  {row.charging_location_code}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCurrency(row.anchor_amount)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCurrency(row.scenario_amount)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                  {row.delta === 0 ? '±€0' : formatDeltaWithArrow(row.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Year {data.year} · anchor version{' '}
        <code className="text-[11px] bg-muted px-1 rounded">
          {data.anchor_version}
        </code>{' '}
        · scenario version{' '}
        <code className="text-[11px] bg-muted px-1 rounded">
          {data.scenario_version}
        </code>
      </p>
    </div>
  );
}
