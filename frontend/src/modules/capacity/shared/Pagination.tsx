/**
 * Pagination — small custom pagination component for the capacity
 * history table (v5.2 W3, Track D).
 *
 * shadcn/ui doesn't ship a Pagination primitive in this codebase, so
 * this is a focused button group: prev / numbered pages (with leading
 * + trailing ellipsis when needed) / next. Uses semantic Tailwind
 * tokens so it adapts to dark mode.
 *
 * Spec §12.11 mentions "Pagination" as part of the history page
 * structure. Used by `CapacityHistory.tsx`.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total number of pages. ``<= 1`` hides the component. */
  totalPages: number;
  /** Called with the new 1-based page number. */
  onPageChange: (page: number) => void;
  /** Optional className for the outer wrapper. */
  className?: string;
}

/**
 * Build the list of page numbers to render. Returns a mix of numbers
 * and the literal `'…'` so callers can render an ellipsis where pages
 * are skipped.
 *
 * Behaviour:
 *   - Always show the first and last page.
 *   - Show up to 2 pages either side of the current page.
 *   - Insert `'…'` in the gaps.
 */
function buildPageList(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | '…'> = [];
  const left = Math.max(2, page - 1);
  const right = Math.min(totalPages - 1, page + 1);

  pages.push(1);
  if (left > 2) pages.push('…');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push('…');
  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span
            key={`ellipsis-${i}`}
            className="px-2 text-sm text-muted-foreground select-none"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            type="button"
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Go to page ${p}`}
            className="h-8 min-w-[2rem] px-2"
          >
            {p}
          </Button>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
