/**
 * Detail panel that expands below the impact summary strip when a tile is
 * clicked. Renders the appropriate dimension component lazily (one open at
 * a time, per spec line 1076).
 *
 * The header is shared so the close affordance + dimension label live in
 * one place; the body is the per-dimension renderer.
 */

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DIMENSION_META,
  type DimensionKey,
  type ImpactDashboardResponse,
} from '../../lib/impactTypes';
import { FinancialDimension } from './dimensions/FinancialDimension';
import { BacklogRankingDimension } from './dimensions/BacklogRankingDimension';
import { CapacityDimension } from './dimensions/CapacityDimension';
import { PeopleDimension } from './dimensions/PeopleDimension';
import { OutsourcingDimension } from './dimensions/OutsourcingDimension';
import { InvestmentMixDimension } from './dimensions/InvestmentMixDimension';
import { RunningCostDimension } from './dimensions/RunningCostDimension';
import { CostAllocationDimension } from './dimensions/CostAllocationDimension';
import { ChangeSummaryFeed } from './ChangeSummaryFeed';

interface ImpactDetailPanelProps {
  dimensionKey: DimensionKey;
  impact: ImpactDashboardResponse;
  tier3Visible: boolean;
  onClose: () => void;
}

export function ImpactDetailPanel({
  dimensionKey,
  impact,
  tier3Visible,
  onClose,
}: ImpactDetailPanelProps) {
  const meta = DIMENSION_META[dimensionKey];
  const dims = impact.dimensions;

  return (
    <div
      data-testid={`impact-detail-${dimensionKey}`}
      className="border-t border-border bg-background"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Impact detail
          </span>
          <span className="text-sm font-semibold text-foreground">
            {meta.label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close detail panel"
          className="h-7 w-7 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-4 py-4">
        {dimensionKey === 'financial' && (
          <FinancialDimension data={dims.financial} />
        )}
        {dimensionKey === 'backlog_ranking' && (
          <BacklogRankingDimension data={dims.backlog_ranking} />
        )}
        {dimensionKey === 'capacity' && (
          <CapacityDimension data={dims.capacity} />
        )}
        {dimensionKey === 'people' && (
          <PeopleDimension data={dims.people} tier3Visible={tier3Visible} />
        )}
        {dimensionKey === 'outsourcing_ratio' && (
          <OutsourcingDimension data={dims.outsourcing_ratio} />
        )}
        {dimensionKey === 'investment_mix' && (
          <InvestmentMixDimension data={dims.investment_mix} />
        )}
        {dimensionKey === 'running_cost' && (
          <RunningCostDimension data={dims.running_cost} />
        )}
        {dimensionKey === 'cost_allocation' && (
          <CostAllocationDimension data={dims.cost_allocation} />
        )}
        {dimensionKey === 'change_summary' && (
          <ChangeSummaryFeed data={dims.change_summary} />
        )}
      </div>
    </div>
  );
}
