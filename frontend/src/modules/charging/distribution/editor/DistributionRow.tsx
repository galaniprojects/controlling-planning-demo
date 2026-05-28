/**
 * A single distribution edge row inside the table. Spec §5.3 — five
 * columns (Destination / Percentage / Amount / Depth / Action) plus an
 * inline rationale field below the destination label.
 *
 * Editing model: percentage + rationale are always-editable inputs on
 * draft versions; updates dispatch through the editor's reducer. The
 * Save / Discard buttons in the action bar flush the whole form. On
 * active versions everything renders read-only (no inputs, no delete).
 */
import { Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatPercent,
  formatCurrencyDetailed,
} from '@/lib/formatters';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import type { ChargeableEntityType } from '@/types/api';
import type { PendingRow } from './state';

/**
 * The destination-column colour strip uses a stronger 500-weight fill
 * than the badge background. Kept inline here (and reused from
 * EntityPickerDialog) — `EntityTypeBadge` only owns the pill colours
 * by design.
 */
const SUBTYPE_STRIP_CLASS: Record<ChargeableEntityType, string> = {
  Project: 'bg-blue-500 dark:bg-blue-600',
  Offering: 'bg-purple-500 dark:bg-purple-600',
  InternalService: 'bg-violet-500 dark:bg-violet-600',
};

export function subtypeStripClass(type: ChargeableEntityType): string {
  return SUBTYPE_STRIP_CLASS[type];
}

interface Props {
  row: PendingRow;
  amount: number;
  maxAllocationDepth: number;
  readOnly: boolean;
  isEdited: boolean;
  isFocused: boolean;
  onChangePct: (value: number) => void;
  onChangeRationale: (value: string) => void;
  onDelete: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function DistributionRow({
  row,
  amount,
  maxAllocationDepth,
  readOnly,
  isEdited,
  isFocused,
  onChangePct,
  onChangeRationale,
  onDelete,
  onFocus,
  onBlur,
}: Props) {
  if (row.isDeleted) return null;

  const depthLabel = row.chainDepth != null ? `${row.chainDepth}/${maxAllocationDepth}` : '—';

  return (
    <tr
      className={cn(
        'border-b border-border align-top',
        isFocused && 'bg-accent/40',
        isEdited && !isFocused && 'bg-violet-50/50 dark:bg-violet-900/10',
      )}
    >
      {/* Destination — strip + name + identifier + type, inline rationale below */}
      <td className="py-2 px-3">
        <div className="flex items-stretch gap-2">
          <span
            className={cn(
              'w-1 rounded-sm flex-shrink-0 self-stretch',
              subtypeStripClass(row.destinationType),
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">
                {row.destinationName}
              </span>
              <EntityTypeBadge type={row.destinationType} />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              {row.destinationIdentifier}
            </span>
            <div className="mt-1.5">
              {readOnly ? (
                <p
                  className="text-[11px] text-muted-foreground italic leading-snug"
                  title={row.rationale}
                >
                  {row.rationale.trim() || 'No rationale'}
                </p>
              ) : (
                <Textarea
                  value={row.rationale}
                  onChange={(e) => onChangeRationale(e.target.value)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  placeholder="Why this destination shares this percentage…"
                  rows={1}
                  maxLength={2000}
                  className="text-[11px] py-1 min-h-[28px] max-w-md"
                />
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Percentage */}
      <td className="py-2 px-3 align-top">
        {readOnly ? (
          <span className="font-mono text-sm tabular-nums text-foreground">
            {formatPercent(row.percentage, { signed: false, decimals: 2 })}
          </span>
        ) : (
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={Number.isFinite(row.percentage) ? String(row.percentage) : ''}
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : Number(e.target.value);
              onChangePct(Number.isFinite(v) ? v : 0);
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            className={cn(
              'w-[100px] h-8 font-mono text-right tabular-nums',
              isFocused && 'border-primary ring-2 ring-primary/30',
            )}
          />
        )}
      </td>

      {/* Amount */}
      <td className="py-2 px-3 align-top text-right">
        <span className="font-mono text-sm tabular-nums text-foreground">
          {formatCurrencyDetailed(amount)}
        </span>
      </td>

      {/* Depth */}
      <td className="py-2 px-3 align-top">
        {row.chainDepth == null ? (
          <span className="text-[11px] text-muted-foreground italic">—</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-mono tabular-nums',
              row.nearMaxDepthWarning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
            title={
              row.nearMaxDepthWarning
                ? `Within 1 of the configured max allocation depth (${maxAllocationDepth}).`
                : `Chain depth ${depthLabel}.`
            }
          >
            {row.nearMaxDepthWarning && <AlertTriangle className="h-3 w-3" />}
            {depthLabel}
          </span>
        )}
      </td>

      {/* Action */}
      <td className="py-2 px-3 align-top text-right">
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            title="Delete this distribution row"
            className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}
