/**
 * Two-row legend for the External Costs monthly grid.
 *
 * Row 1 — Cell values: Forecast / Actuals / Accrual / PO/Obligo
 * Row 2 — Status:      Planned / Ordered / GR / Invoiced / Accrual / Open
 *
 * Two visual variants behind a `style` prop (the wrapping grid drives the
 * toggle via `useLegendStyle`):
 *   - 'chips' — sample value rendered in the actual cell style; status row
 *     renders the real ExternalCostStatusBadge component.
 *   - 'dots'  — coloured dot + label per chip; status row uses
 *     STATUS_DOT_COLORS for parity with the cell-row dots.
 *
 * v5.1 C-09 follow-up. Throwaway loser-deletes once the user picks.
 */
import {
  ExternalCostStatusBadge,
  STATUS_DOT_COLORS,
  getStatusLabel,
} from '../forecast/ExternalCostStatusBadge';
import { EC_CELL_LINE_STYLES } from './ExternalCostCell';
import type { LegendStyle } from '@/hooks/useLegendStyle';

interface Props {
  style: LegendStyle;
}

const SAMPLE_VALUE = '12k€';

const CELL_ITEMS: Array<{
  key: keyof typeof EC_CELL_LINE_STYLES;
  label: string;
  /** Bg colour for the dot variant; mirrors the cell-text colour intent. */
  dotColor: string;
}> = [
  { key: 'forecast', label: 'Forecast', dotColor: 'bg-foreground' },
  {
    key: 'actuals',
    label: 'Actuals',
    dotColor: 'bg-emerald-700 dark:bg-emerald-400',
  },
  {
    key: 'accrual',
    label: 'Accrual',
    dotColor: 'bg-purple-700 dark:bg-purple-400',
  },
  {
    key: 'po_obligo',
    label: 'PO / Obligo',
    dotColor: 'bg-blue-700 dark:bg-blue-400',
  },
];

const STATUS_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'planned', label: getStatusLabel('planned') },
  { key: 'ordered', label: getStatusLabel('ordered') },
  { key: 'goods_received', label: getStatusLabel('goods_received') },
  { key: 'invoiced', label: getStatusLabel('invoiced') },
  { key: 'accrual', label: getStatusLabel('accrual') },
  { key: 'open', label: getStatusLabel('open') },
];

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

export function ExternalCostsGridLegend({ style }: Props) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border bg-muted/20 text-xs">
      {/* Row 1 — cell values */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Cell values
        </span>
        {CELL_ITEMS.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1.5 font-mono"
          >
            {style === 'chips' ? (
              <span className={EC_CELL_LINE_STYLES[item.key]}>
                {SAMPLE_VALUE}
              </span>
            ) : (
              <Dot color={item.dotColor} />
            )}
            <span className="text-foreground/80 font-sans">{item.label}</span>
          </span>
        ))}
      </div>

      {/* Row 2 — procurement status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Status
        </span>
        {STATUS_ITEMS.map((item) =>
          style === 'chips' ? (
            <ExternalCostStatusBadge key={item.key} status={item.key} />
          ) : (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <Dot color={STATUS_DOT_COLORS[item.key] ?? 'bg-muted-foreground'} />
              <span className="text-foreground/80">{item.label}</span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}
