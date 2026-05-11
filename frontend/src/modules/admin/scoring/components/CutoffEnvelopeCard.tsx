/**
 * CutoffEnvelopeCard — single EUR input for `ranking_total_available_budget`.
 *
 * Drives the should-be / reality cutoff lines on the Backlog. Editing this
 * triggers `recompute_within_cutoff_for_backlog` on save.
 */

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  onChange: (next: number) => void;
  saved: number;
  /** Server-computed pre-funded total of Type 3 projects. The cutoff walk
   * subtracts this from total_available_budget. Pass 0 if none. */
  type3PreFundedTotal: number;
  /** Server-computed committed-overhead of operate-stage projects.
   * Also subtracted from total_available_budget. Pass 0 if none. */
  hyperMaintenanceCommittedTotal: number;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE').format(Math.round(n));
}

export function CutoffEnvelopeCard({
  value,
  onChange,
  saved,
  type3PreFundedTotal,
  hyperMaintenanceCommittedTotal,
}: Props) {
  const dirty = saved !== value;
  const contestable = Math.max(
    0,
    value - type3PreFundedTotal - hyperMaintenanceCommittedTotal,
  );

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          Backlog cutoff envelope
        </h3>
      </div>
      <Separator />

      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5',
          dirty && '-mx-2 px-2 rounded bg-amber-50 dark:bg-amber-900/20',
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            Total Available Budget
          </div>
          <div className="text-xs text-muted-foreground">
            Currently {formatEur(value)} €.
          </div>
        </div>
        <Input
          type="number"
          inputMode="numeric"
          className="h-8 w-[180px] text-sm text-right tabular-nums"
          value={value}
          min={0}
          step={100000}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) {
              onChange(Math.max(0, n));
            }
          }}
          aria-label="Total Available Budget in EUR"
        />
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border">
        <div className="flex items-center justify-between gap-3 pt-2">
          <span>− Type 3 pre-funded</span>
          <span className="tabular-nums">{formatEur(type3PreFundedTotal)} €</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>− Hyper-maintenance committed</span>
          <span className="tabular-nums">{formatEur(hyperMaintenanceCommittedTotal)} €</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 font-medium text-foreground">
          <span>= Contestable envelope</span>
          <span className="tabular-nums">{formatEur(contestable)} €</span>
        </div>
        <div className="pt-1 text-muted-foreground italic">
          The contestable envelope is what the should-be / reality cutoffs
          compare cumulative budget against on the ranked backlog.
        </div>
      </div>
    </Card>
  );
}
