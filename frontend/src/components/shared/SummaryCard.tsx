/**
 * SummaryCard — KPI summary card per `[E-07d]` (relocated from
 * `modules/capacity/shared/` in v5 Session E8 so all three card types
 * live under `components/shared/`).
 *
 * E8 codifies three card types:
 *   1. **Summary** (this component) — coloured background or muted
 *      surface, no border, used for KPI metrics in horizontal grids.
 *   2. **Surface** — neutral background, subtle border (shadcn `Card`).
 *   3. **Action**  — surface card + hover + click affordance
 *      (`ActionCard.tsx`).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  className?: string;
}

export function SummaryCard({ label, value, icon, className }: SummaryCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
