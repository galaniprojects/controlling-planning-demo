/**
 * AxisWeightsCard — reusable card that hosts a labeled set of WeightControl
 * rows with a live sum indicator in the header.
 *
 * Used for the Composite mixer (V/C), the Complexity axis (3 weights), and
 * the Value Creation axis (3 weights).
 */

import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  icon?: LucideIcon;
  /** Children should be a list of <WeightControl> rows. */
  children: React.ReactNode;
  sum?: number;
  /** Show a small "sum ≠ 100" hint when true. Purely informational. */
  hintNonStandardSum?: boolean;
  /**
   * Optional mini-formula block rendered between the header and the row
   * list — gives each axis card the same self-explanatory "name = formula"
   * affordance as the top-level FormulaCard.
   */
  formula?: React.ReactNode;
}

export function AxisWeightsCard({
  title,
  icon: Icon,
  children,
  sum,
  hintNonStandardSum,
  formula,
}: Props) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? (
            <Icon
              className="h-4 w-4 text-muted-foreground shrink-0"
              aria-hidden
            />
          ) : null}
          <h3 className="text-sm font-semibold text-foreground truncate">
            {title}
          </h3>
        </div>
        {sum !== undefined ? (
          <span
            className={
              hintNonStandardSum
                ? 'text-xs text-amber-600 dark:text-amber-400 tabular-nums'
                : 'text-xs text-muted-foreground tabular-nums'
            }
          >
            sum {sum}
          </span>
        ) : null}
      </div>
      {formula ? <div className="pt-0.5">{formula}</div> : null}
      <Separator />
      <div className="space-y-0.5">{children}</div>
    </Card>
  );
}
