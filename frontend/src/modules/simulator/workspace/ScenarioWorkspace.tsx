import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { useBottomDrawer } from '@/contexts/BottomDrawerContext';
import { useScenarioState } from '../useScenarioState';
import { ActionPanel } from './ActionPanel';
import { ImpactNarrative } from './ImpactNarrative';
import { KPIComparisonStrip } from './KPIComparisonStrip';
import { ScenarioPortfolioTree } from './ScenarioPortfolioTree';
import { AIAdvisorPanel } from '../advisor/AIAdvisorPanel';
import { DrillDownContent } from '../drilldown/DrillDownContent';

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
    advisorQuery,
    advisorApply,
  } = useScenarioState(scenarioId);

  const { scenario, loading, error, advisorLoading, advisorNarrative } = state;
  const [showAdvisor, setShowAdvisor] = useState(false);
  const { openDrawer } = useBottomDrawer();

  const affectedCount = useMemo(
    () => scenario?.project_states.filter((p) => p.is_affected).length ?? 0,
    [scenario],
  );

  const handleProjectRowClick = useCallback(
    (node: { id: string; name: string }) => {
      openDrawer(
        node.name,
        <DrillDownContent scenarioId={scenarioId} projectId={node.id} />,
      );
    },
    [scenarioId, openDrawer],
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
        <Button
          variant={showAdvisor ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowAdvisor((v) => !v)}
          className={showAdvisor ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          AI Advisor
        </Button>
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

        {/* Center: Impact Dashboard */}
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
            onRowClick={handleProjectRowClick}
          />
        </div>

        {/* Right: AI Advisor Panel (conditional) */}
        {showAdvisor && (
          <AIAdvisorPanel
            scenarioId={scenarioId}
            onAdvisorQuery={advisorQuery}
            onAdvisorApply={advisorApply}
            advisorLoading={advisorLoading}
            advisorNarrative={advisorNarrative}
          />
        )}
      </div>
    </div>
  );
}
