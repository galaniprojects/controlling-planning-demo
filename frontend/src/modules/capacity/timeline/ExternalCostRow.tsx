/**
 * ExternalCostRow — v5.2 W5 Track B (spec §10.6).
 *
 * One row per `ResourceRequest` with `request_type='external_cost'` for
 * a project. No person assignment — just timeline span + status icon.
 *
 * Bar cells:
 *   - Thin (8px high) neutral-color bar covering the period span.
 *   - Status icon on the FIRST month of the period:
 *       Check  — confirmed
 *       Clock  — pending confirmation
 */
import { Check, Clock, Euro } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type TimeColumn,
  NAME_COLUMN_WIDTH,
} from './timeAxis';
import type { CapacityProjectExternalCost } from '@/types/api';

export interface ExternalCostRowProps {
  cost: CapacityProjectExternalCost;
  columns: readonly TimeColumn[];
}

export function ExternalCostRow({ cost, columns }: ExternalCostRowProps) {
  const description = cost.description ?? cost.cost_type_label ?? 'External cost';
  const isConfirmed = cost.status === 'confirmed';
  const StatusIcon = isConfirmed ? Check : Clock;

  // Find the column that contains the first month inside the cost's period.
  // We render the status icon and the start of the bar there. The bar
  // continues through subsequent columns until the period ends.
  const periodStart = cost.period_start;
  const periodEnd = cost.period_end;
  const inPeriod = (m: string): boolean => m >= periodStart && m <= periodEnd;

  // Identify the leading column (first column whose months overlap the period).
  let leadingColIdx = -1;
  let trailingColIdx = -1;
  columns.forEach((col, idx) => {
    const overlap = col.months.some(inPeriod);
    if (overlap) {
      if (leadingColIdx === -1) leadingColIdx = idx;
      trailingColIdx = idx;
    }
  });

  return (
    <div
      className={cn(
        'flex h-7 items-stretch border-b border-border/50',
        'transition-colors hover:bg-accent/30',
      )}
      role="row"
      aria-label={`External cost: ${description}, ${cost.status}`}
    >
      {/* Sticky-left name cell — indented 20px */}
      <div
        className="sticky left-0 z-[5] flex items-center gap-1.5 border-r border-border bg-card pl-6 pr-2 text-xs"
        style={{ width: NAME_COLUMN_WIDTH }}
      >
        <Euro className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              {description}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <div className="font-medium">{description}</div>
            {cost.cost_type_label && (
              <div className="text-[11px] opacity-90">{cost.cost_type_label}</div>
            )}
            <div className="text-[11px] opacity-75">
              {periodStart} → {periodEnd}
            </div>
            {cost.cc_name && (
              <div className="text-[11px] opacity-75">{cost.cc_name}</div>
            )}
            <div className="mt-0.5 text-[11px] capitalize opacity-90">
              Status: {cost.status}
            </div>
          </TooltipContent>
        </Tooltip>
        {cost.cost_type_label && (
          <span
            className="shrink-0 rounded-sm bg-secondary/60 px-1 py-0 text-[9px] font-medium uppercase tracking-wide text-secondary-foreground"
            title={cost.cost_type_label}
          >
            {cost.cost_type_label}
          </span>
        )}
      </div>

      {/* Bar cells */}
      {columns.map((col, idx) => {
        const inSpan = idx >= leadingColIdx && idx <= trailingColIdx;
        const isLeading = idx === leadingColIdx;
        return (
          <div
            key={col.key}
            className={cn(
              'flex shrink-0 items-center px-0.5 py-1',
              col.type !== 'month' && 'bg-muted/10',
            )}
            style={{ width: col.width }}
          >
            {inSpan ? (
              <div className="relative flex h-2 w-full items-center">
                {/* Thin bar — neutral gray, lower opacity */}
                <div
                  className="h-2 w-full rounded-[1px] bg-muted-foreground/40"
                  aria-hidden="true"
                />
                {isLeading && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'absolute -left-0.5 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                          isConfirmed
                            ? 'border-green-500 bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                            : 'border-amber-500 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
                        )}
                      >
                        <StatusIcon className="h-2.5 w-2.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="font-medium capitalize">{cost.status}</div>
                      <div className="text-[11px] opacity-90">{description}</div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div className="h-2 w-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}
