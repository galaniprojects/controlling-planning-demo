/**
 * Two-row legend for the External Costs monthly grid.
 *
 * Row 1 — Cell values: ● Forecast / ● Actuals / ● Accrual / ● PO/Obligo
 *         Coloured dots matching the cell-text colours used in real cells.
 * Row 2 — Status:      Real ExternalCostStatusBadge components for the 6
 *         procurement statuses (Planned / Ordered / GR / Invoiced / Accrual /
 *         Open).
 *
 * v5.1 C-09 follow-up. The mix of dots-for-cells + chips-for-status was
 * picked over a single-style legend after A/B testing both variants —
 * dots are cleaner for the per-series cell colours, while the real badges
 * are a more honest reference for the status column they label.
 */
import { ExternalCostStatusBadge } from '../forecast/ExternalCostStatusBadge';

const CELL_ITEMS: Array<{
  key: 'forecast' | 'actuals' | 'accrual' | 'po_obligo';
  label: string;
  /** Bg colour for the dot; mirrors the cell-text colour intent. */
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

const STATUS_KEYS = [
  'planned',
  'ordered',
  'goods_received',
  'invoiced',
  'accrual',
  'open',
] as const;

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

export function ExternalCostsGridLegend() {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-border bg-muted/20 text-xs">
      {/* Row 1 — cell values (dots) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Cell values
        </span>
        {CELL_ITEMS.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5">
            <Dot color={item.dotColor} />
            <span className="text-foreground/80">{item.label}</span>
          </span>
        ))}
      </div>

      {/* Row 2 — procurement status (real badges) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground font-medium w-24 shrink-0">
          Status
        </span>
        {STATUS_KEYS.map((key) => (
          <ExternalCostStatusBadge key={key} status={key} />
        ))}
      </div>
    </div>
  );
}
