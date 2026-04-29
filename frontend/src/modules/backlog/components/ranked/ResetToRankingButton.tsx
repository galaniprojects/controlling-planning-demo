/**
 * ResetToRankingButton — visible when a sort override is active. [A-BK-25]
 */

import { ArrowUpDown } from 'lucide-react';

interface Props {
  onClick: () => void;
}

export function ResetToRankingButton({ onClick }: Props) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-900/20">
      <span className="text-amber-700 dark:text-amber-400">
        Custom sort active — cutoff bands and misalignment highlighting are
        hidden.
      </span>
      <button
        type="button"
        onClick={onClick}
        className="ml-3 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-amber-700 underline hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400 dark:hover:bg-amber-900/30"
      >
        <ArrowUpDown className="size-3" aria-hidden />
        Reset to ranking order
      </button>
    </div>
  );
}
