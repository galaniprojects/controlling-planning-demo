/**
 * ActionCard — application-wide action card per `[E-07d]`.
 *
 * Three card types are codified in v5 Cluster E `[E-07d]`:
 *  1. Summary card  — coloured background, no border (KPI metrics)
 *  2. Surface card  — neutral background, subtle border (content containers)
 *  3. **Action card** (this component) — surface card + hover state +
 *     click affordance, used for navigation tiles (Launchpad, Workbench
 *     Overview tile grid, pending action items).
 *
 * The component takes a title, optional description, and arbitrary children
 * which form the tile body. When `onClick` is provided the whole card
 * becomes a button-like surface with a subtle hover ring and pointer
 * cursor; without a click handler it renders as a static surface (used for
 * identity-only tiles such as the Project Header).
 *
 * Loading and error states are deliberately built in so individual tile
 * components can stay focused on their data fetching + content.
 */
import * as React from 'react';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';

export interface ActionCardProps {
  /** Tile heading. */
  title: React.ReactNode;
  /**
   * Optional badge / chip rendered to the right of the title (e.g. RAG
   * dot, version number, status).
   */
  headerRight?: React.ReactNode;
  /** Body content. */
  children?: React.ReactNode;
  /**
   * Click handler. When provided the card receives hover styling + a
   * chevron affordance, otherwise it renders as a static surface card.
   */
  onClick?: () => void;
  /** Pulsing skeleton placeholder. */
  loading?: boolean;
  /** Inline error message shown in place of the body. */
  error?: string | null;
  /** Empty-state copy shown when there is no data to render. */
  emptyState?: React.ReactNode;
  /** Minimum-content sentinel — when true, render the empty state. */
  isEmpty?: boolean;
  /** Extra className passed through to the outer card. */
  className?: string;
  /** Optional aria-label override (defaults to the string-form title). */
  ariaLabel?: string;
}

export function ActionCard({
  title,
  headerRight,
  children,
  onClick,
  loading = false,
  error = null,
  emptyState,
  isEmpty = false,
  className,
  ariaLabel,
}: ActionCardProps) {
  const interactive = typeof onClick === 'function';

  const wrapperClasses = cn(
    'group relative flex h-full min-h-[180px] w-full flex-col rounded-xl border border-border bg-card p-4 text-left text-card-foreground shadow-sm transition-all',
    interactive &&
      'cursor-pointer hover:border-primary/40 hover:shadow-md hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );

  const headingId = React.useId();

  const body = (() => {
    if (loading) {
      return (
        <div className="space-y-2 mt-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex items-start gap-2 mt-3 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      );
    }
    if (isEmpty && emptyState !== undefined) {
      return (
        <div className="mt-3 text-xs text-muted-foreground">{emptyState}</div>
      );
    }
    return children;
  })();

  const inner = (
    <>
      <header className="flex items-start justify-between gap-2">
        <h3
          id={headingId}
          className="text-sm font-medium text-muted-foreground"
        >
          {title}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {headerRight}
          {interactive && (
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </div>
      </header>
      <div className="flex-1 flex flex-col">{body}</div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={wrapperClasses}
        aria-label={
          ariaLabel ?? (typeof title === 'string' ? title : undefined)
        }
      >
        {inner}
      </button>
    );
  }

  return <div className={wrapperClasses}>{inner}</div>;
}
