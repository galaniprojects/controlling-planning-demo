/**
 * ForecastCell — single data cell in MixedGranularityGrid.
 *
 * Pure presentational component extracted from MixedGranularityGrid as Wave 2
 * pre-work for v5.1 C-02 / C-08. Displays hours (internal) or currency
 * (external) with optional provisional-dot, comparison-delta indicator, and
 * zone-boundary / year-start / quarterly-zone styling. The parent computes
 * all layout flags and lookups (delta index, display values, boundary
 * detection) and passes them in as props — this component does no derivation.
 *
 * The C-08 three-point rendering (baseline / forecast / actuals) extends this
 * file in the same wave; the prop surface intentionally stays tight so the
 * extension can layer on cleanly.
 */
import { TableCell } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrencyCompact, formatNumber } from '@/lib/formatters';
import { renderDeltaIndicator as renderDeltaIndicatorHelper } from '@/modules/simulator/lib/cellDiffHelpers';
import type { CellDelta } from '@/types/api';

export interface ForecastCellDisplay {
  hours: number;
  amount: number;
  provisional: boolean;
}

interface ForecastCellProps {
  category: string; // 'internal' | 'external'
  display: ForecastCellDisplay;
  delta?: CellDelta;
  hasChange: boolean;
  yearStart: boolean;
  boundary: boolean;
  isQuarterly: boolean;
  isExpandedSub: boolean;
}

function ProvisionalDot() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label="Provisional value"
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mr-1 align-middle"
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs">
            Provisional value (auto-distributed or pre-populated). Edit to confirm.
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ForecastCell({
  category,
  display,
  delta,
  hasChange,
  yearStart,
  boundary,
  isQuarterly,
  isExpandedSub,
}: ForecastCellProps) {
  const className = [
    'text-right text-xs',
    yearStart ? 'border-l-2 border-border' : '',
    boundary ? 'border-l-4 border-l-blue-400 dark:border-l-blue-500' : '',
    isQuarterly ? 'bg-blue-50/30 dark:bg-blue-900/10' : '',
    isExpandedSub ? 'bg-blue-50/10 dark:bg-blue-900/5' : '',
    hasChange
      ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300/40 dark:ring-amber-600/30'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (display.amount === 0 && display.hours === 0) {
    return (
      <TableCell className={className}>
        <span className="text-muted-foreground/40">&mdash;</span>
      </TableCell>
    );
  }

  return (
    <TableCell className={className}>
      <div className="flex flex-col items-end">
        <span className="font-tabular font-medium inline-flex items-center">
          {display.provisional && <ProvisionalDot />}
          {category === 'internal'
            ? `${formatNumber(display.hours)}h`
            : formatCurrencyCompact(display.amount)}
        </span>
        {category === 'internal' && (
          <span className="text-[10px] text-muted-foreground font-tabular">
            {formatCurrencyCompact(display.amount)}
          </span>
        )}
        {hasChange && renderDeltaIndicatorHelper(delta?.delta ?? null)}
      </div>
    </TableCell>
  );
}
