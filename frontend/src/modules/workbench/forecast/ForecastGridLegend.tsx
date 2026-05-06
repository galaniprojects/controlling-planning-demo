/**
 * Two-row legend for the F&P MixedGranularityGrid.
 *
 * Row 1 — Cell values: Forecast / Baseline / Actuals (3-stack from C-08).
 *         The F&P cell uses role-based styling (primary / secondary / tertiary),
 *         not per-series colours, so the chips here render each series in its
 *         most common role to give the user a visual anchor for the size +
 *         weight hierarchy they'll see in real cells.
 *
 * Row 2 — Grid hints: lifted as-is from the previous inline legend block at
 *         MixedGranularityGrid.tsx — Monthly zone / Quarterly zone swatches,
 *         Provisional dot, the "Quarterly columns can be expanded" tooltip,
 *         and the "Expand all quarters" / "Collapse all quarters" toggle.
 *
 * Two visual variants behind a `style` prop. The dots variant is greyscale —
 * the F&P stack doesn't use distinct colours per series, so the dots are all
 * muted-foreground with subtle opacity gradation matching the role hierarchy.
 *
 * v5.1 C-09 follow-up. Throwaway loser-deletes once the user picks.
 */
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { LegendStyle } from '@/hooks/useLegendStyle';

interface Props {
  style: LegendStyle;
  granularityBoundaryMonths: number;
  horizonEndMonth: string;
  expandedQuartersCount: number;
  onToggleAllQuarters: () => void;
}

const SAMPLE_VALUE = '120h';

/**
 * Role-typical Tailwind classes per series. The F&P cell renders each series
 * with primary/secondary/tertiary classes depending on temporal context;
 * here we pick the most common role for each so the legend chips look like
 * what users will see most of the time.
 */
const FP_CELL_LINE_STYLES = {
  // Forecast is most often the primary value (current/future months).
  forecast: 'font-medium text-foreground',
  // Actuals is primary in past months, secondary in current.
  actuals: 'text-[11px] text-muted-foreground',
  // Baseline is always tertiary — smallest and most muted.
  baseline: 'text-[10px] text-muted-foreground/80',
} as const;

const CELL_DOT_STYLES = {
  forecast: 'bg-foreground',
  actuals: 'bg-muted-foreground',
  baseline: 'bg-muted-foreground/50',
} as const;

const CELL_ITEMS: Array<{ key: keyof typeof FP_CELL_LINE_STYLES; label: string }> = [
  { key: 'forecast', label: 'Forecast' },
  { key: 'actuals', label: 'Actuals' },
  { key: 'baseline', label: 'Baseline' },
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
  style,
  granularityBoundaryMonths,
  horizonEndMonth,
  expandedQuartersCount,
  onToggleAllQuarters,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {/* Row 1 — cell values */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Cell values
        </span>
        {CELL_ITEMS.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1.5"
          >
            {style === 'chips' ? (
              <span className={`${FP_CELL_LINE_STYLES[item.key]} font-mono`}>
                {SAMPLE_VALUE}
              </span>
            ) : (
              <Dot color={CELL_DOT_STYLES[item.key]} />
            )}
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
