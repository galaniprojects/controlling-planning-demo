/**
 * Self-retained row — muted/greyed appearance, dashed border circular
 * arrow icon, read-only `100% − sum(distributions) − to_business_pct`.
 * Spec §5.3.
 *
 * Goes red when over-allocated so the user gets a visual hint where the
 * imbalance lives (the value renders as a negative percentage).
 */
import { RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatPercent,
  formatCurrencyDetailed,
} from '@/lib/formatters';

interface Props {
  selfRetainedPct: number;
  selfRetainedAmount: number;
  isOverAllocated: boolean;
}

export function SelfRetainedRow({
  selfRetainedPct,
  selfRetainedAmount,
  isOverAllocated,
}: Props) {
  return (
    <tr
      className={cn(
        'border-t border-dashed border-border bg-muted/40',
        isOverAllocated && 'bg-red-50/70 dark:bg-red-900/15',
      )}
    >
      <td className="py-2 px-3">
        <div className="flex items-stretch gap-2">
          <span
            className={cn(
              'w-6 flex-shrink-0 flex items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground',
              isOverAllocated && 'text-red-700 dark:text-red-400 border-red-400',
            )}
            aria-hidden
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'text-sm font-medium',
                isOverAllocated
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-muted-foreground',
              )}
            >
              Self-retained
            </span>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Computed: 100% − Σ distributions − to-business
            </p>
          </div>
        </div>
      </td>
      <td className="py-2 px-3 align-top">
        <span
          className={cn(
            'font-mono text-sm tabular-nums',
            isOverAllocated
              ? 'text-red-700 dark:text-red-400'
              : 'text-muted-foreground',
          )}
        >
          {formatPercent(selfRetainedPct, { signed: false, decimals: 2 })}
        </span>
      </td>
      <td className="py-2 px-3 align-top text-right">
        <span
          className={cn(
            'font-mono text-sm tabular-nums',
            isOverAllocated
              ? 'text-red-700 dark:text-red-400'
              : 'text-muted-foreground',
          )}
        >
          {formatCurrencyDetailed(selfRetainedAmount)}
        </span>
      </td>
      <td className="py-2 px-3 align-top">
        <span className="text-[11px] text-muted-foreground italic">—</span>
      </td>
      <td className="py-2 px-3 align-top text-right" />
    </tr>
  );
}
