/**
 * TshirtThresholdsCard — four EUR upper-bounds (XS/S/M/L; XL is implicit
 * above L) with a small horizontal scale visualization.
 *
 * Number inputs, not sliders, because the range spans 0–1,000,000+ EUR.
 */

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Shirt } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Thresholds {
  xs_max: number;
  s_max: number;
  m_max: number;
  l_max: number;
}

interface Props {
  value: Thresholds;
  onChange: (next: Thresholds) => void;
  saved: Thresholds;
}

const ROWS: Array<{ key: keyof Thresholds; label: string; bandLabel: string }> = [
  { key: 'xs_max', label: 'XS upper bound', bandLabel: 'XS' },
  { key: 's_max', label: 'S upper bound', bandLabel: 'S' },
  { key: 'm_max', label: 'M upper bound', bandLabel: 'M' },
  { key: 'l_max', label: 'L upper bound', bandLabel: 'L' },
];

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE').format(Math.round(n));
}

export function TshirtThresholdsCard({ value, onChange, saved }: Props) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Shirt className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          T-shirt size thresholds (EUR)
        </h3>
      </div>
      <Separator />

      <div className="space-y-0.5">
        {ROWS.map((r) => {
          const v = value[r.key];
          const dirty = saved[r.key] !== v;
          return (
            <div
              key={r.key}
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-1.5',
                dirty && '-mx-2 px-2 rounded bg-amber-50 dark:bg-amber-900/20',
              )}
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {r.bandLabel}
              </span>
              <div className="text-sm text-foreground">
                {r.bandLabel} ≤ {formatEur(v)} €
              </div>
              <Input
                type="number"
                inputMode="numeric"
                className="h-8 w-[140px] text-sm text-right tabular-nums"
                value={v}
                min={0}
                step={1000}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) {
                    onChange({ ...value, [r.key]: n });
                  }
                }}
                aria-label={r.label}
              />
            </div>
          );
        })}
        <div className="pt-2 text-xs text-muted-foreground">
          Above {formatEur(value.l_max)} € = XL.
        </div>
      </div>
    </Card>
  );
}
