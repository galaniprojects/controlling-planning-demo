/**
 * PersonChip — v5.2 W4 Track A (Session 6a).
 *
 * Displays an assigned person inside a month row:
 *   Abbreviated name + projected utilisation (colored by bucket) + ✕ remove
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Assignment slot(s)"
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Util bucket
// ---------------------------------------------------------------------------

type UtilBucket = 'blue' | 'green' | 'amber' | 'red';

function utilBucket(pct: number): UtilBucket {
  if (pct > 100) return 'red';
  if (pct >= 90) return 'amber';
  if (pct >= 70) return 'green';
  return 'blue';
}

const BUCKET_CLASSES: Record<UtilBucket, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Abbreviate name: "Felix Keller" → "F. Keller"
// ---------------------------------------------------------------------------

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PersonChipProps {
  personName: string;
  projectedUtilPct: number;
  /**
   * The hours portion this person carries for the month. Optional —
   * the W4 single-person flow doesn't need it, but the W5 S10 multi-person
   * split renders it so the user can see how the requested total breaks down
   * (per spec §9.5 example: "F. Keller 40h (72%)").
   */
  hours?: number;
  /**
   * When true, shows a partial-fulfillment indicator on the chip border.
   * Used in the multi-person view when sum(hours) < requestedHours.
   */
  showPartialIndicator?: boolean;
  onRemove: () => void;
  className?: string;
}

export function PersonChip({
  personName,
  projectedUtilPct,
  hours,
  showPartialIndicator,
  onRemove,
  className,
}: PersonChipProps) {
  const bucket = utilBucket(projectedUtilPct);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-border bg-accent/50 px-1.5 py-0.5 text-xs',
        showPartialIndicator &&
          'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
        className,
      )}
    >
      <span className="text-foreground">{abbreviateName(personName)}</span>
      {typeof hours === 'number' && (
        <span className="text-muted-foreground tabular-nums">{hours}h</span>
      )}
      <span className={cn('font-medium', BUCKET_CLASSES[bucket])}>
        ({Math.round(projectedUtilPct)}%)
      </span>
      <button
        type="button"
        onClick={(e) => {
          // Stop propagation so clicking ✕ doesn't bubble into a parent
          // click handler (e.g. the row's [+ Add] popover toggle).
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 rounded text-muted-foreground hover:text-foreground focus:outline-none"
        aria-label={`Remove ${personName}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
