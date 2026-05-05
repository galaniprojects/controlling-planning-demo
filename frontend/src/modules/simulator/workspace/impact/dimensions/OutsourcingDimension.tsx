/**
 * Dimension 5 — Outsourcing ratio impact.
 *
 * Internal vs external split. Two horizontal bars side-by-side with totals
 * + percentages. Headline already in the dimension data.
 */

import { Card } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { OutsourcingDimensionData } from '../../../lib/impactTypes';

interface OutsourcingDimensionProps {
  data: OutsourcingDimensionData | undefined;
}

export function OutsourcingDimension({ data }: OutsourcingDimensionProps) {
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No outsourcing data for this scenario.
      </p>
    );
  }

  const total = data.internal_total + data.external_total;
  const internalWidth = total ? (data.internal_total / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <Card className="px-4 py-3 bg-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Internal / external split
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Total {formatCurrency(total)}
          </span>
        </div>
        {total > 0 ? (
          <div className="h-3 rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400"
              style={{ width: `${internalWidth}%` }}
              aria-label="Internal share"
            />
            <div
              className="h-full bg-purple-500 dark:bg-purple-400"
              style={{ width: `${100 - internalWidth}%` }}
              aria-label="External share"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No forecasts in scope.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="px-4 py-3 bg-card">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Internal
            </p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-1">
            {formatCurrency(data.internal_total)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatPercent(data.internal_pct, { signed: false })} of total
          </p>
        </Card>
        <Card className="px-4 py-3 bg-card">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-500 dark:bg-purple-400" />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              External
            </p>
          </div>
          <p className="text-lg font-semibold text-foreground mt-1">
            {formatCurrency(data.external_total)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatPercent(data.external_pct, { signed: false })} of total
          </p>
        </Card>
      </div>
    </div>
  );
}
