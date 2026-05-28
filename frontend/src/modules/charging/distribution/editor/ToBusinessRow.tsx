/**
 * "To Business" row — distinguished amber treatment, arrow icon
 * instead of subtype strip, editable percentage bound to
 * `ChargeableEntity.to_business_pct`. Spec §5.3.
 *
 * The subtitle shows the count of business terminals (charging
 * locations) attached to the focal entity in the Stage 2 graph. No
 * depth badge or delete action.
 */
import { ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  formatPercent,
  formatCurrencyDetailed,
} from '@/lib/formatters';

interface Props {
  toBusinessPct: number;
  toBusinessAmount: number;
  /** Pre-derived count of `cascade.business_terminals`. */
  locationCount: number;
  readOnly: boolean;
  isEdited: boolean;
  isFocused: boolean;
  onChangePct: (value: number) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function ToBusinessRow({
  toBusinessPct,
  toBusinessAmount,
  locationCount,
  readOnly,
  isEdited,
  isFocused,
  onChangePct,
  onFocus,
  onBlur,
}: Props) {
  return (
    <tr
      className={cn(
        'border-b border-border bg-amber-50/60 dark:bg-amber-900/10',
        isEdited && 'bg-amber-100/70 dark:bg-amber-900/20',
        isFocused && 'bg-amber-100 dark:bg-amber-900/30',
      )}
    >
      <td className="py-2 px-3">
        <div className="flex items-stretch gap-2">
          <span
            className="w-6 flex-shrink-0 flex items-center justify-center text-amber-700 dark:text-amber-400"
            aria-hidden
          >
            <ArrowRight className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                To Business
              </span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                terminal
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {locationCount} active charging location{locationCount === 1 ? '' : 's'}
              {' · flows to business via Stage 2 BTC profile'}
            </p>
          </div>
        </div>
      </td>
      <td className="py-2 px-3 align-top">
        {readOnly ? (
          <span className="font-mono text-sm tabular-nums text-foreground">
            {formatPercent(toBusinessPct, { signed: false, decimals: 2 })}
          </span>
        ) : (
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={Number.isFinite(toBusinessPct) ? String(toBusinessPct) : ''}
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : Number(e.target.value);
              onChangePct(Number.isFinite(v) ? v : 0);
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            className={cn(
              'w-[100px] h-8 font-mono text-right tabular-nums',
              isFocused && 'border-amber-500 ring-2 ring-amber-400/40',
            )}
          />
        )}
      </td>
      <td className="py-2 px-3 align-top text-right">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {formatCurrencyDetailed(toBusinessAmount)}
        </span>
      </td>
      <td className="py-2 px-3 align-top">
        <span className="text-[11px] text-muted-foreground italic">—</span>
      </td>
      <td className="py-2 px-3 align-top text-right" />
    </tr>
  );
}
