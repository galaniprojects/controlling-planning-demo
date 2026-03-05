import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import type { AdvisorPath, AdvisorQueryResponse } from '@/types/api';
import { PathCard } from './PathCard';

const LOADING_PHASES = [
  'Analyzing portfolio impacts...',
  'Evaluating trade-offs...',
  'Generating solution paths...',
];

interface AIAdvisorPanelProps {
  scenarioId: number;
  onAdvisorQuery: (goal: string) => Promise<AdvisorQueryResponse | null>;
  onAdvisorApply: (pathId: string) => Promise<void>;
  advisorLoading: boolean;
  advisorNarrative: string | null;
}

export function AIAdvisorPanel({
  onAdvisorQuery,
  onAdvisorApply,
  advisorLoading,
  advisorNarrative,
}: AIAdvisorPanelProps) {
  const [goalText, setGoalText] = useState('');
  const [paths, setPaths] = useState<AdvisorPath[] | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle loading phases
  useEffect(() => {
    if (advisorLoading) {
      setLoadingPhase(0);
      intervalRef.current = setInterval(() => {
        setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length);
      }, 1200);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [advisorLoading]);

  const handleSubmit = useCallback(async () => {
    if (!goalText.trim() || advisorLoading) return;
    setPaths(null);
    setNoMatch(false);
    const result = await onAdvisorQuery(goalText.trim());
    if (!result) return;
    if (result.paths.length > 0) {
      setPaths(result.paths);
      setNoMatch(false);
    } else {
      setPaths(null);
      setNoMatch(true);
    }
  }, [goalText, advisorLoading, onAdvisorQuery]);

  const handleApply = useCallback(
    async (pathId: string) => {
      setApplying(true);
      await onAdvisorApply(pathId);
      setApplying(false);
    },
    [onAdvisorApply],
  );

  return (
    <div className="w-[370px] shrink-0 border-l border-indigo-100 bg-indigo-50/60 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">AI Advisor</h3>
        </div>
        <Badge className="bg-indigo-100 text-indigo-600 hover:bg-indigo-100 text-[10px] px-1.5 py-0">
          AI-assisted
        </Badge>
      </div>

      {/* Goal input */}
      <div className="space-y-2">
        <Input
          placeholder="e.g., Find €2M in savings without touching Rail Systems"
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="text-sm bg-white"
        />
        <Button
          size="sm"
          className="w-full bg-indigo-600 hover:bg-indigo-700"
          disabled={!goalText.trim() || advisorLoading}
          onClick={handleSubmit}
        >
          Analyze Portfolio
        </Button>
      </div>

      {/* Loading animation */}
      {advisorLoading && (
        <div className="flex items-center gap-3 py-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
          </span>
          <p className="text-sm text-indigo-600 font-medium">
            {LOADING_PHASES[loadingPhase]}
          </p>
        </div>
      )}

      {/* No-match message */}
      {noMatch && (
        <Card className="bg-white p-4">
          <p className="text-sm text-slate-500">
            I wasn&apos;t able to map that goal to a specific optimization
            strategy. Try goals like: &ldquo;Find cost savings&rdquo;,
            &ldquo;Reduce utilization pressure&rdquo;, or &ldquo;Prioritize
            Rail investments&rdquo;.
          </p>
        </Card>
      )}

      {/* Path cards */}
      {paths &&
        paths.map((path) => (
          <PathCard
            key={path.path_id}
            path={path}
            onApply={handleApply}
            applying={applying}
          />
        ))}

      {/* Narrative summary after apply */}
      {advisorNarrative && (
        <Card className="bg-indigo-50 border-indigo-200 p-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-indigo-700 mb-1">
                Applied Path Summary
              </p>
              <p className="text-xs text-slate-700 leading-relaxed">
                {advisorNarrative}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
