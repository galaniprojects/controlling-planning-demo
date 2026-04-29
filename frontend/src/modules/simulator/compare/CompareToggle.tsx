/**
 * Show values vs Show changes from anchor toggle per spec line 991.
 *
 * Used at L2 and L3. Same grid layout, just swaps the cell content.
 *
 * Implemented as a simple two-button segmented control so the active state
 * is obvious and keyboard-accessible. The mode is owned by the parent page;
 * this component only renders the control + dispatches changes.
 */

import { Button } from '@/components/ui/button';

export type CompareDisplayMode = 'values' | 'changes';

interface CompareToggleProps {
  mode: CompareDisplayMode;
  onChange: (mode: CompareDisplayMode) => void;
  /** Disables the toggle (e.g., L1 portfolio summary always shows headlines). */
  disabled?: boolean;
}

export function CompareToggle({
  mode,
  onChange,
  disabled = false,
}: CompareToggleProps) {
  return (
    <div
      role="group"
      aria-label="Compare display mode"
      className="inline-flex rounded-md border border-border overflow-hidden"
    >
      <Button
        type="button"
        size="sm"
        variant={mode === 'values' ? 'default' : 'ghost'}
        disabled={disabled}
        onClick={() => onChange('values')}
        className={[
          'rounded-none px-3 h-8 text-xs',
          mode === 'values' ? '' : 'text-muted-foreground',
        ].join(' ')}
        aria-pressed={mode === 'values'}
      >
        Show values
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === 'changes' ? 'default' : 'ghost'}
        disabled={disabled}
        onClick={() => onChange('changes')}
        className={[
          'rounded-none px-3 h-8 text-xs',
          mode === 'changes' ? '' : 'text-muted-foreground',
        ].join(' ')}
        aria-pressed={mode === 'changes'}
      >
        Show changes from anchor
      </Button>
    </div>
  );
}
