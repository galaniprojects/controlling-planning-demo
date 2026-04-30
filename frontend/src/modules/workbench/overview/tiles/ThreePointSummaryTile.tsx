/**
 * Workbench Overview tile (1,2) — Three-Point Summary per `[E-04b]`.
 *
 * Compact summary of baseline / forecast / actuals YTD with derived plan
 * drift % and execution variance %. Click target opens the variance
 * waterfall dialog (`[E-05c]`).
 */
import { ActionCard } from '@/components/shared/ActionCard';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ThreePointComparison } from '@/types/api';

interface Props {
  data: ThreePointComparison;
  onClick: () => void;
}

function varianceColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs > 10) return 'text-red-600 dark:text-red-400';
  if (abs > 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

export function ThreePointSummaryTile({ data, onClick }: Props) {
  const planDriftPct =
    data.baseline !== 0
      ? ((data.forecast - data.baseline) / data.baseline) * 100
      : 0;
  const execVarPct =
    data.forecast !== 0 ? (data.execution_variance / data.forecast) * 100 : 0;

  return (
    <ActionCard title="Three-Point Summary" onClick={onClick}>
      <div className="mt-3 space-y-3">
        {/* Three primary values */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Baseline</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(data.baseline)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Forecast</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(data.forecast)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Actuals YTD</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(data.actuals)}
            </p>
          </div>
        </div>

        {/* Variance row */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
          <div>
            <p className="text-muted-foreground">Plan drift</p>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                varianceColor(planDriftPct),
              )}
            >
              {formatPercent(planDriftPct)}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {formatCurrency(data.forecast - data.baseline)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Exec. variance</p>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                varianceColor(execVarPct),
              )}
            >
              {formatPercent(execVarPct)}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {formatCurrency(data.execution_variance)}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-auto">
          Open variance waterfall →
        </p>
      </div>
    </ActionCard>
  );
}
