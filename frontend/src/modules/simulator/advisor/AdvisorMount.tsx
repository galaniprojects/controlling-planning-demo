/**
 * v5 B2 — Advisor mount wrapper.
 *
 * Bridges the v4 `AIAdvisorPanel` (which expects callback props) to
 * the v5 hook-based `useAdvisor()`. Rendered only when
 * `ADVISOR_ENABLED` is true.
 */

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useScenarioContext } from '../useScenarioContext';
import { useAdvisor } from './useAdvisor';
import { AIAdvisorPanel } from './AIAdvisorPanel';

interface Props {
  onClose: () => void;
}

export function AdvisorMount({ onClose }: Props) {
  const ctx = useScenarioContext();
  const advisor = useAdvisor();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-foreground/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="w-full sm:max-w-2xl max-h-[80vh] overflow-y-auto m-0 sm:m-4 rounded-b-none sm:rounded-lg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end mb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close advisor"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <AIAdvisorPanel
          scenarioId={ctx.scenarioId}
          onAdvisorQuery={advisor.advisorQuery}
          onAdvisorApply={advisor.advisorApply}
          advisorLoading={advisor.advisorLoading}
          advisorNarrative={advisor.advisorNarrative}
        />
      </Card>
    </div>
  );
}
