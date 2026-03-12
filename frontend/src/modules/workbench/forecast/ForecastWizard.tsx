import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/shared/Skeleton';
import { useForecastCycle } from './useForecastCycle';
import { Phase1Retrospective } from './Phase1Retrospective';
import { Phase2Suggestions } from './Phase2Suggestions';
import { Phase3EditForecast } from './Phase3EditForecast';
import { Phase4Review } from './Phase4Review';
import { Phase5Confirmation } from './Phase5Confirmation';
import { ArrowLeft, Check } from 'lucide-react';

interface Props {
  projectId: string;
  nameMap: Record<string, string>;
  onComplete: () => void;
  onCancel: () => void;
}

const PHASE_LABELS = [
  'Retrospective',
  'Suggestions',
  'Edit Forecast',
  'Review',
  'Confirmation',
];

export function ForecastWizard({ projectId, nameMap, onComplete, onCancel }: Props) {
  const cycle = useForecastCycle(projectId);
  const { state } = cycle;
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    cycle.startCycle();
  }, []);

  if (state.loading && state.phase === 1 && !state.cycleId) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </div>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Back to Forecast View
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Phase stepper */}
      <div className="flex items-center gap-1">
        {PHASE_LABELS.map((label, i) => {
          const phaseNum = i + 1;
          const isCurrent = state.phase === phaseNum;
          const isDone = state.phase > phaseNum;
          return (
            <div key={label} className="flex items-center">
              {i > 0 && (
                <div
                  className={`w-8 h-0.5 ${isDone ? 'bg-blue-600' : 'bg-slate-200'}`}
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isDone
                      ? 'bg-blue-600 text-white'
                      : isCurrent
                        ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : phaseNum}
                </div>
                <span
                  className={`text-xs ${
                    isCurrent
                      ? 'font-medium text-slate-700'
                      : 'text-slate-400'
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel / Back button */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      </div>

      {/* Phase content */}
      {state.phase === 1 && (
        <Phase1Retrospective
          retrospective={state.retrospective}
          skippable={state.skippable}
          explanations={state.explanations}
          nameMap={nameMap}
          onSetExplanation={(key, text) =>
            cycle.setExplanation(key, text)
          }
          onAcknowledge={() => cycle.acknowledgeRetrospective()}
          onSkip={() => cycle.skipRetrospective()}
          loading={state.loading}
        />
      )}

      {state.phase === 2 && (
        <Phase2Suggestions
          suggestions={state.suggestions}
          appliedIds={state.appliedSuggestionIds}
          dismissedIds={state.dismissedSuggestionIds}
          onApply={(id) => cycle.applySuggestion(id)}
          onDismiss={(id) => cycle.dismissSuggestion(id)}
          onContinue={() => cycle.advanceToEdit()}
        />
      )}

      {state.phase === 3 && (
        <Phase3EditForecast
          projectId={projectId}
          workingChanges={state.workingChanges}
          appliedSuggestionIds={state.appliedSuggestionIds}
          suggestions={state.suggestions}
          onCellChange={(change) => cycle.updateCell(change)}
          onSaveAndReview={() => cycle.saveEditsAndAdvance()}
          loading={state.loading}
        />
      )}

      {state.phase === 4 && (
        <Phase4Review
          reviewGroups={state.reviewGroups}
          justifications={state.justifications}
          onSetJustification={(type, text) =>
            cycle.setJustification(type, text)
          }
          onSubmit={() => cycle.submitCycle()}
          onBack={() => cycle.goBack()}
          loading={state.loading}
        />
      )}

      {state.phase === 5 && (
        <Phase5Confirmation
          submittedCRs={state.submittedCRs}
          onDone={onComplete}
        />
      )}
    </div>
  );
}
