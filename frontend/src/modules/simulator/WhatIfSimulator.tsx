import { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useRole } from '@/contexts/RoleContext';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { ScenarioManager } from './manager/ScenarioManager';
import { ScenarioWorkspace } from './workspace/ScenarioWorkspace';
import { ComparisonView } from './comparison/ComparisonView';

type SimulatorPhase =
  | { view: 'manager' }
  | { view: 'workspace'; scenarioId: number }
  | { view: 'comparison' };

export function WhatIfSimulator() {
  const { context, currentRoleId } = useRole();
  const role = context?.role ?? '';
  const [phase, setPhase] = useState<SimulatorPhase>({ view: 'manager' });

  // Reset to manager when role changes
  useEffect(() => {
    setPhase({ view: 'manager' });
  }, [currentRoleId]);

  // No-access for non-authorized roles
  if (role === 'project_lead' || role === 'cost_center_owner') {
    return (
      <div className="px-6 py-6">
        <Card className="max-w-md mx-auto mt-24 p-8 text-center">
          <ShieldAlert className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-700 mb-1">
            Access Restricted
          </h2>
          <p className="text-sm text-slate-500">
            The What-If Simulator is available to Controllers and Executives
            only.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      {phase.view === 'manager' && (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            What-If Simulator
          </h1>
          <ModuleGuideButton moduleId="whatif_simulator" />
        </div>
      )}

      {/* Phase router */}
      {phase.view === 'manager' && (
        <ScenarioManager
          onOpenScenario={(id) =>
            setPhase({ view: 'workspace', scenarioId: id })
          }
          onCompare={() => setPhase({ view: 'comparison' })}
        />
      )}

      {phase.view === 'workspace' && (
        <ScenarioWorkspace
          scenarioId={phase.scenarioId}
          onBack={() => setPhase({ view: 'manager' })}
        />
      )}

      {phase.view === 'comparison' && (
        <ComparisonView onBack={() => setPhase({ view: 'manager' })} />
      )}
    </div>
  );
}
