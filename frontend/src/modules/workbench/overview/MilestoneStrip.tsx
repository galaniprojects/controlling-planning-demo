import type { TimelineMilestone } from '@/types/api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  milestones: TimelineMilestone[];
  months: string[];
}

export function MilestoneStrip({ milestones, months }: Props) {
  if (milestones.length === 0) return null;

  // Build a month-to-index map for positioning
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const totalCols = months.length;

  return (
    <div className="mt-1">
      <div
        className="relative h-6 rounded"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
        }}
      >
        {milestones.map((milestone) => {
          const startIdx = monthIndex.get(milestone.forecast_start);
          const endIdx = monthIndex.get(milestone.forecast_end);
          if (startIdx === undefined || endIdx === undefined) return null;

          const colStart = startIdx + 1;
          const colEnd = endIdx + 2; // grid is 1-based, end is exclusive

          // Check for baseline slip
          const baselineEndIdx = monthIndex.get(milestone.baseline_end);
          const hasSlip = milestone.slip_months > 0;

          return (
            <TooltipProvider key={milestone.sequence_number} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center justify-center rounded-sm text-[9px] font-medium text-white cursor-default relative"
                    style={{
                      gridColumn: `${colStart} / ${colEnd}`,
                      gridRow: 1,
                      backgroundColor: milestone.color,
                      opacity: 0.85,
                    }}
                  >
                    <span className="truncate px-1">{milestone.name}</span>
                    {hasSlip && baselineEndIdx !== undefined && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-muted-foreground"
                        style={{
                          left: `${((baselineEndIdx - startIdx + 1) / (endIdx - startIdx + 1)) * 100}%`,
                        }}
                        title={`Baseline end: ${milestone.baseline_end}`}
                      />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="space-y-1">
                    <div className="font-medium">{milestone.name}</div>
                    <div className="text-muted-foreground">
                      Baseline: {milestone.baseline_start} to {milestone.baseline_end}
                    </div>
                    <div className="text-muted-foreground">
                      Forecast: {milestone.forecast_start} to {milestone.forecast_end}
                    </div>
                    {hasSlip && (
                      <div className="text-red-500">
                        Slip: +{milestone.slip_months} month{milestone.slip_months > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
}
