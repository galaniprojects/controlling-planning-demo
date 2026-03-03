import { useMemo } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/shared/Skeleton';
import { useScenarioState } from '../useScenarioState';
import { ActionPanel } from './ActionPanel';
import { ImpactNarrative } from './ImpactNarrative';
import { KPIComparisonStrip } from './KPIComparisonStrip';
import { ScenarioPortfolioTree } from './ScenarioPortfolioTree';

interface Props {
  scenarioId: number;
  onBack: () => void;
}

export function ScenarioWorkspace({ scenarioId, onBack }: Props) {
  const {
    state,
    updateMetadata,
    applyAction,
    removeAction,
  } = useScenarioState(scenarioId);

  const { scenario, loading, error } = state;

  const affectedCount = useMemo(
    () => scenario?.project_states.filter((p) => p.is_affected).length ?? 0,
    [scenario],
  );

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Scenarios
        </Button>
        <div className="text-center py-12 text-red-600">
          <p className="text-sm">Failed to load scenario: {error}</p>
        </div>
      </div>
    );
  }

  if (!scenario && loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          <div className="w-[380px] space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Scenarios
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" disabled>
              <Sparkles className="h-4 w-4 mr-1.5" />
              AI Advisor
            </Button>
          </TooltipTrigger>
          <TooltipContent>Coming in next update</TooltipContent>
        </Tooltip>
      </div>

      {/* Split layout */}
      <div className="flex gap-4 min-h-[calc(100vh-220px)]">
        {/* Left: Action Panel */}
        <div className="w-[380px] shrink-0 overflow-y-auto">
          <ActionPanel
            metadata={scenario.metadata}
            actions={scenario.actions}
            onUpdateMetadata={updateMetadata}
            onRemoveAction={removeAction}
            onApplyAction={applyAction}
            projectStates={scenario.project_states}
            loading={loading}
          />
        </div>

        {/* Right: Impact Dashboard */}
        <div className="flex-1 min-w-0 space-y-4">
          <ImpactNarrative
            impact={scenario.impact_dashboard}
            affectedCount={affectedCount}
          />
          <KPIComparisonStrip
            impact={scenario.impact_dashboard}
            affectedCount={affectedCount}
          />
          <ScenarioPortfolioTree
            projectStates={scenario.project_states}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
