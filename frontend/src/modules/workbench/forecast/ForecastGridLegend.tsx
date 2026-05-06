/**
 * Two-row legend for the F&P MixedGranularityGrid.
 *
 * Row 1 — Cell values: ● Forecast / ● Actuals / ● Baseline (3-stack from C-08).
 *         Coloured dots matching the per-series cell colours. Order in each
 *         real cell shifts based on past / current / future month, so this
 *         legend only labels the colours, not the ordering.
 *
 * Row 2 — Grid hints: Monthly zone / Quarterly zone swatches, Provisional dot,
 *         "Quarterly columns can be expanded" tooltip, plus the
 *         "Expand / Collapse all quarters" toggle button. Lifted as-is from
 *         the previous inline legend block at MixedGranularityGrid.tsx.
 */
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  granularityBoundaryMonths: number;
  horizonEndMonth: string;
  expandedQuartersCount: number;
  onToggleAllQuarters: () => void;
}

const CELL_ITEMS: Array<{
  key: 'forecast' | 'actuals' | 'baseline';
  label: string;
  /** Dot bg colour. Must mirror the cell-text colour used in ForecastCell. */
  dotColor: string;
}> = [
  { key: 'forecast', label: 'Forecast', dotColor: 'bg-foreground' },
  {
    key: 'actuals',
    label: 'Actuals',
    dotColor: 'bg-emerald-700 dark:bg-emerald-400',
  },
  {
    key: 'baseline',
    label: 'Baseline',
    dotColor: 'bg-indigo-600 dark:bg-indigo-400',
  },
];

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

export function ForecastGridLegend({
  granularityBoundaryMonths,
  horizonEndMonth,
  expandedQuartersCount,
  onToggleAllQuarters,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {/* Row 1 — cell values (dots) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Cell values
        </span>
        {CELL_ITEMS.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <Dot color={item.dotColor} />
            <span className="text-foreground/80">{item.label}</span>
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground/70 italic">
          Order in each cell depends on past / current / future month
        </span>
      </div>

      {/* Row 2 — grid hints (lifted from the previous inline legend) */}
      <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Grid hints
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-card border border-border" />
          Monthly zone (next {granularityBoundaryMonths} months)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" />
          Quarterly zone (out to {horizonEndMonth})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          Provisional
        </span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-help">
                <Info className="h-3.5 w-3.5" />
                Quarterly columns can be expanded
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">
                Click a quarter header (e.g. &quot;Q2&quot;) to reveal its three constituent
                months. Per [C-FG-03] the quarterly aggregate is distributed equally.
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={onToggleAllQuarters}
        >
          {expandedQuartersCount > 0 ? 'Collapse all quarters' : 'Expand all quarters'}
        </Button>
      </div>
    </div>
  );
}
