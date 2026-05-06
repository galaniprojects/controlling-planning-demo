/**
 * 4-value stacked cell for the External Costs monthly grid.
 *
 * v5.1 C-09 lead pre-work stub. Teammate B implements:
 *   - Render top-to-bottom (skip null/zero):
 *       1. Forecast — text-foreground font-semibold tabular-nums (#0f172a)
 *       2. Actuals  — text-emerald-700 dark:text-emerald-400 (#059669)
 *       3. Accrual  — text-purple-700 dark:text-purple-400 italic (#7c3aed)
 *       4. PO/Obligo — text-blue-700 dark:text-blue-400 (#2563eb)
 *   - Past → all 4. Current → all non-null. Future → Forecast + PO/Obligo.
 *   - Empty cell after filtering → single `—` in `text-[#d1d5db]`.
 *   - `formatCurrencyCompact` from `lib/formatters` for cell density.
 */
import { TableCell } from '@/components/ui/table';

export type CellTemporalContext = 'past' | 'current' | 'future';

interface Props {
  forecast?: number | null;
  actuals?: number | null;
  accrual?: number | null;
  poObligo?: number | null;
  temporalContext: CellTemporalContext;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ExternalCostCell(_props: Props) {
  return <TableCell />;
}
