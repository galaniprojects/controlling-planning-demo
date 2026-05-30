/**
 * RunCascadePanel — Cascade-mode embed for the Run "Cost Distributions" tab
 * (VIPER Wave 5, spec §10.1/§10.3).
 *
 * Renders the shared allocation-flow visual in its VERTICAL orientation for
 * the selected Offering / Internal Service. The focal entity sits at the top
 * with upstream feeders + downstream consumers / BTC business terminals
 * flowing top→bottom.
 *
 * Integration (Lane B's embeddable contract):
 *   - `orientation="vertical"` swaps the layout axis.
 *   - `embedded` suppresses the component's own Breadcrumb / ModuleHeader /
 *     Back-to-Workbench chrome and page padding (FocalStrip is kept).
 *   - `entityId` drives selection directly (overrides the URL `?entity=`), so
 *     no URL mutation is needed — the parent's standalone picker / Rollup
 *     drill-down owns the selected entity.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AllocationFlowView } from '@/components/shared/allocation-flow/AllocationFlowView';

interface RunCascadePanelProps {
  entityId: string;
  /** Return to Rollup mode (clears the cascade selection). */
  onBack: () => void;
}

export function RunCascadePanel({ entityId, onBack }: RunCascadePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to roll-up
        </Button>
      </div>
      <AllocationFlowView orientation="vertical" embedded entityId={entityId} />
    </div>
  );
}
