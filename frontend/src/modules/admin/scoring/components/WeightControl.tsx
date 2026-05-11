/**
 * WeightControl — one labeled row: name, slider, number input.
 *
 * Slider and Input are both controlled by the parent's value, so they stay
 * in sync without internal state. Numeric only; range 0-100; step 1.
 */

import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  isDirty?: boolean;
}

export function WeightControl({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '%',
  hint,
  isDirty = false,
}: Props) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 py-1.5',
        isDirty && '-mx-2 px-2 rounded bg-amber-50 dark:bg-amber-900/20',
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
        {hint ? (
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        ) : null}
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0])}
        aria-label={label}
      />
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="numeric"
          className="h-8 w-[72px] text-sm text-right"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          aria-label={`${label} numeric`}
        />
        {unit ? (
          <span className="text-xs text-muted-foreground w-3">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}
