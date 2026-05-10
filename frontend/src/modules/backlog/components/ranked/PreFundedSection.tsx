/**
 * PreFundedSection — collapsible section showing P3 pre-funded projects.
 * [A-BK-18][A-TN-08]
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RankedProjectItem } from '@/types/api';
import { RankedRow } from './RankedRow';
import { RANKED_TABLE_HEADERS } from './RankedListTable';

interface Props {
  items: RankedProjectItem[];
}

export function PreFundedSection({ items }: Props) {
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-card dark:border-red-900/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm font-semibold text-foreground">
          Pre-funded — P3
        </span>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {items.length} project{items.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Legal / compliance / security / lifecycle — exempt from cutoff
        </span>
      </button>

      {open ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-border">
                {RANKED_TABLE_HEADERS.map((h) => (
                  <th
                    key={h.key}
                    className={`px-3 py-2 text-xs font-medium text-muted-foreground ${h.align ?? 'text-left'}`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <RankedRow key={item.project_id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
