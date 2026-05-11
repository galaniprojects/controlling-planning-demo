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
  /** Variable name shown in brackets after the label, e.g. "s" → "Standardization (s)". */
  varName?: string;
  /** Weight variable subscript shown after the unit, e.g. "s" → "(w_s)". */
  weightVarName?: string;
  /** When true, both the slider and the numeric input are disabled so an
   * in-flight save can't have its post-save refetch silently overwrite
   * user-side edits made during the round-trip. */
  disabled?: boolean;
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
  varName,
  weightVarName,
  disabled = false,
}: Props) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto] items-center gap-3 py-1.5',
        isDirty && '-mx-2 px-2 rounded bg-amber-50 dark:bg-amber-900/20',
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {label}
          {varName ? (
            <span className="ml-1.5 font-mono text-muted-foreground">
              ({varName})
            </span>
          ) : null}
        </div>
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
        disabled={disabled}
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          className="h-8 w-[72px] text-sm text-right"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            // Clamp to [min, max] — HTML min/max attrs aren't enforced for
            // typed input; without this a user can type 150 (or -50) and
            // produce nonsense weighted-averages downstream.
            onChange(Math.max(min, Math.min(max, n)));
          }}
          aria-label={`${label} numeric`}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {unit ? <span>{unit}</span> : null}
          {weightVarName ? (
            <span className="ml-1 font-mono">
              (w<sub>{weightVarName}</sub>)
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
