/**
 * Status badge for `DistributionVersion` per FD-3 [F-S1-02..08].
 *
 * - **Active** — emerald (live variant + dark variant per CLAUDE.md).
 * - **Draft**  — amber (light + dark variants).
 * - **In force** — primary tint badge variant; only shown when the
 *   surfacing context wants to mark "this is the version the resolver
 *   would pick *right now*" (the active version with the latest
 *   `active_from ≤ today`).
 *
 * Origin sub-pill is rendered when `showOrigin` is true (used on the
 * version-detail view; suppressed in compact lists).
 */
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  DistributionVersionOrigin,
  DistributionVersionStatus,
} from '@/types/api';
import { originLabel } from './versionLabels';

export interface VersionStatusBadgeProps {
  status: DistributionVersionStatus;
  /** Adds an "In force" badge when true (production resolver pick). */
  isInForce?: boolean;
  /** Renders an origin sub-pill (e.g. "Copied from active"). */
  origin?: DistributionVersionOrigin;
  /** Compact (`sm`) for table rows; default for headers. */
  size?: 'sm' | 'md';
  className?: string;
}

export function VersionStatusBadge({
  status,
  isInForce = false,
  origin,
  size = 'md',
  className,
}: VersionStatusBadgeProps) {
  const isSmall = size === 'sm';

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {status === 'active' ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md font-medium',
            'bg-emerald-100 text-emerald-700',
            'dark:bg-emerald-900/30 dark:text-emerald-400',
            isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
          )}
        >
          <CheckCircle2 className={isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          Active
        </span>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md font-medium',
            'bg-amber-100 text-amber-700',
            'dark:bg-amber-900/30 dark:text-amber-400',
            isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
          )}
        >
          <Circle className={isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          Draft
        </span>
      )}

      {isInForce && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md font-medium',
            'bg-primary/10 text-primary',
            'dark:bg-primary/20 dark:text-primary',
            isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
          )}
        >
          <Sparkles className={isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          In force
        </span>
      )}

      {origin && (
        <Badge
          variant="secondary"
          className={cn(
            isSmall ? 'text-[10px] px-1.5' : 'text-xs px-2',
            'font-normal',
          )}
        >
          {originLabel(origin)}
        </Badge>
      )}
    </div>
  );
}
