/**
 * EmptyState — shared empty-state pattern per `[E-07f]`.
 *
 * Standardises empty-state treatment across modules: optional Lucide
 * icon (h-10 w-10 muted), short title, optional one-line description,
 * optional primary action button. Keeps copy consistent and avoids
 * each module rolling its own "no data yet" div.
 *
 * Usage:
 *   <EmptyState
 *     icon={Inbox}
 *     title="No reports yet"
 *     description="Saved reports appear here."
 *     action={{ label: 'Create report', onClick: () => navigate('...') }}
 *   />
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Optional Lucide icon component (rendered at h-10 w-10). */
  icon?: LucideIcon;
  /** Short title — required. */
  title: ReactNode;
  /** One-line explanation. */
  description?: ReactNode;
  /** Primary action button (label + onClick). */
  action?: { label: string; onClick: () => void };
  /** Visual size — `sm` for in-card empties, `md` for whole-tab empties. */
  size?: 'sm' | 'md';
  /** Extra className passed to the outer wrapper. */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'py-12 px-6 gap-3' : 'py-6 px-4 gap-2',
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            'text-muted-foreground/60',
            size === 'md' ? 'h-10 w-10' : 'h-7 w-7',
          )}
          aria-hidden="true"
        />
      )}
      <p
        className={cn(
          'font-medium text-foreground',
          size === 'md' ? 'text-base' : 'text-sm',
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn(
            'text-muted-foreground max-w-sm',
            size === 'md' ? 'text-sm' : 'text-xs',
          )}
        >
          {description}
        </p>
      )}
      {action && (
        <div className="mt-1">
          <Button
            type="button"
            size={size === 'md' ? 'default' : 'sm'}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
