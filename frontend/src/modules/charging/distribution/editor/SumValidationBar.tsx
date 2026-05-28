/**
 * Segmented progress bar + label + inline legend showing total
 * allocation (Σ distribution % + to-business %). Spec §5.4.
 *
 * Colour states:
 *  - Normal (< 100%) — default text, segments for distributions + amber
 *    to-business + muted self-retained
 *  - Complete (= 100%) — green label, no self-retained segment
 *  - Over-allocated (> 100%) — red label + red overlay, error message,
 *    Save disabled (the editor reads `isOverAllocated` from the
 *    projection helper and disables itself)
 */
import { CheckCircle2, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/lib/formatters';
import type { ProjectedDownstreamRow } from '../helpers/projectAllocation';

interface Props {
  rows: ProjectedDownstreamRow[];
  toBusinessPct: number;
  distributedPct: number;
  selfRetainedPct: number;
  isOverAllocated: boolean;
  isComplete: boolean;
}

export function SumValidationBar({
  rows,
  toBusinessPct,
  distributedPct,
  selfRetainedPct,
  isOverAllocated,
  isComplete,
}: Props) {
  // Clamp segment widths so the bar fills exactly 100% in the normal
  // case and proportionally shrinks each segment in the over case.
  const total = distributedPct + toBusinessPct;
  const denom = isOverAllocated ? Math.max(total, 100) : 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            isComplete && 'text-emerald-700 dark:text-emerald-400',
            isOverAllocated && 'text-red-700 dark:text-red-400',
            !isComplete && !isOverAllocated && 'text-foreground',
          )}
        >
          Total allocation: {formatPercent(Math.max(0, total), { signed: false, decimals: 2 })}{' '}
          / 100%
        </span>
        {isComplete && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3 w-3" /> Complete
          </span>
        )}
        {isOverAllocated && (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-700 dark:text-red-400 font-medium">
            <AlertOctagon className="h-3 w-3" />
            Over-allocated by{' '}
            {formatPercent(total - 100, { signed: false, decimals: 2 })}
          </span>
        )}
      </div>

      {/* Segmented progress bar */}
      <div
        className={cn(
          'h-3 w-full rounded-full overflow-hidden border flex',
          isOverAllocated
            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
            : 'border-border bg-muted',
        )}
        role="progressbar"
        aria-valuenow={Math.round(total)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {rows.map((r) => (
          <div
            key={r.key}
            className="h-full bg-violet-500 dark:bg-violet-400 transition-all"
            style={{ width: `${(r.percentage / denom) * 100}%` }}
            title={`${r.destinationId}: ${formatPercent(r.percentage, { signed: false, decimals: 2 })}`}
          />
        ))}
        {toBusinessPct > 0 && (
          <div
            className="h-full bg-amber-400 dark:bg-amber-500 transition-all"
            style={{ width: `${(toBusinessPct / denom) * 100}%` }}
            title={`To business: ${formatPercent(toBusinessPct, { signed: false, decimals: 2 })}`}
          />
        )}
        {!isOverAllocated && selfRetainedPct > 0 && (
          <div
            className="h-full bg-muted-foreground/30 transition-all"
            style={{ width: `${(selfRetainedPct / denom) * 100}%` }}
            title={`Self-retained: ${formatPercent(selfRetainedPct, { signed: false, decimals: 2 })}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <LegendSwatch className="bg-violet-500 dark:bg-violet-400" label="Distributions" />
        <LegendSwatch className="bg-amber-400 dark:bg-amber-500" label="To business" />
        <LegendSwatch className="bg-muted-foreground/30" label="Self-retained" />
      </div>

      {isOverAllocated && (
        <p className="text-[11px] text-red-700 dark:text-red-400">
          Reduce percentages before saving — total may not exceed 100%.
        </p>
      )}
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-2 w-3 rounded-sm', className)} />
      {label}
    </span>
  );
}
