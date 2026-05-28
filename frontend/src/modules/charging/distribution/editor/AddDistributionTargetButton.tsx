/**
 * Dashed-border "+ Add distribution target" card used below the table on
 * draft versions. Spec §5.5.
 *
 * Click triggers the EntityPickerDialog (the editor owns that state).
 * Hidden entirely on active versions.
 */
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  disabled?: boolean;
}

export function AddDistributionTargetButton({ onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-md border-2 border-dashed border-border',
        'py-3 px-4 text-sm text-muted-foreground hover:text-foreground',
        'hover:border-primary/50 hover:bg-accent/30',
        'transition-colors flex items-center justify-center gap-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent hover:border-border hover:text-muted-foreground',
      )}
    >
      <Plus className="h-4 w-4" />
      Add distribution target
    </button>
  );
}
