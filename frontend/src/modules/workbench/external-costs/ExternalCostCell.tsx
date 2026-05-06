/**
 * 4-value stacked cell for the External Costs monthly grid.
 *
 * v5.1 C-09 — renders up to four stack lines top-to-bottom, skipping
 * any line whose value is null or zero:
 *   1. Forecast — text-foreground font-semibold tabular-nums
 *   2. Actuals  — text-emerald-700 dark:text-emerald-400
 *   3. Accrual  — text-purple-700 dark:text-purple-400 italic
 *   4. PO/Obligo — text-blue-700 dark:text-blue-400
 *
 * Visibility rules per spec lines 492–495 (`temporalContext`):
 *   past    → Forecast + Actuals + Accrual + (PO if poObligo > 0)
 *   current → all non-null lines
 *   future  → Forecast + (PO if poObligo > 0); skip Actuals + Accrual
 *
 * If after filtering nothing renders → output a single muted dash.
 *
 * Currency density: `formatCurrencyCompact` (k/M suffix, no decimals).
 * Cell layout: right-aligned tabular-nums, mono, 11px line-tight.
 */
import { TableCell } from '@/components/ui/table';
import { formatCurrencyCompact } from '@/lib/formatters';

export type CellTemporalContext = 'past' | 'current' | 'future';

/**
 * Tailwind classes for each line in the 4-stack cell. Single source of
 * truth — the legend component reads from this same constant so a sample
 * "12k€" chip in the legend looks identical to a real cell line.
 */
export const EC_CELL_LINE_STYLES = {
  forecast: 'text-foreground font-semibold tabular-nums',
  actuals: 'text-emerald-700 dark:text-emerald-400 tabular-nums',
  accrual: 'text-purple-700 dark:text-purple-400 italic tabular-nums',
  po_obligo: 'text-blue-700 dark:text-blue-400 tabular-nums',
} as const;

interface Props {
  forecast?: number | null;
  actuals?: number | null;
  accrual?: number | null;
  poObligo?: number | null;
  temporalContext: CellTemporalContext;
}

function shouldRender(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value !== 0;
}

export function ExternalCostCell({
  forecast,
  actuals,
  accrual,
  poObligo,
  temporalContext,
}: Props) {
  // Decide which lines are eligible based on temporal context.
  const showForecast = shouldRender(forecast);
  const showActuals =
    (temporalContext === 'past' || temporalContext === 'current') &&
    shouldRender(actuals);
  const showAccrual =
    (temporalContext === 'past' || temporalContext === 'current') &&
    shouldRender(accrual);
  const showPO = shouldRender(poObligo);

  const lines: { key: string; text: string; className: string }[] = [];

  if (showForecast) {
    lines.push({
      key: 'forecast',
      text: formatCurrencyCompact(forecast as number),
      className: EC_CELL_LINE_STYLES.forecast,
    });
  }
  if (showActuals) {
    lines.push({
      key: 'actuals',
      text: formatCurrencyCompact(actuals as number),
      className: EC_CELL_LINE_STYLES.actuals,
    });
  }
  if (showAccrual) {
    lines.push({
      key: 'accrual',
      text: formatCurrencyCompact(accrual as number),
      className: EC_CELL_LINE_STYLES.accrual,
    });
  }
  if (showPO) {
    lines.push({
      key: 'po_obligo',
      text: formatCurrencyCompact(poObligo as number),
      className: EC_CELL_LINE_STYLES.po_obligo,
    });
  }

  return (
    <TableCell className="text-right tabular-nums font-mono text-[11px] leading-tight px-2 py-1">
      {lines.length === 0 ? (
        <span className="text-muted-foreground/40">—</span>
      ) : (
        <div className="flex flex-col items-end gap-0">
          {lines.map((line) => (
            <span key={line.key} className={line.className}>
              {line.text}
            </span>
          ))}
        </div>
      )}
    </TableCell>
  );
}
