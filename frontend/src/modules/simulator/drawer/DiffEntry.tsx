/**
 * v5 B2 — Single change-summary entry (drawer row).
 */

import { History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChangeSummaryEntry } from '../ScenarioContext';
import {
  changeKindLabel,
  formatRelativeTime,
} from '../lib/changeSummary';

interface Props {
  entry: ChangeSummaryEntry;
  /** Callback to remove the underlying scenario action, if any. */
  onRemove?: (actionId: number) => void;
}

export function DiffEntry({ entry, onRemove }: Props) {
  return (
    <li className="px-3 py-2 flex items-start gap-2">
      <History
        className="h-3.5 w-3.5 mt-1 text-muted-foreground flex-shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-foreground truncate">{entry.label}</p>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatRelativeTime(entry.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {changeKindLabel(entry.kind)}
          </span>
          {entry.detail && (
            <span className="text-xs text-muted-foreground truncate">
              {entry.detail}
            </span>
          )}
        </div>
      </div>
      {entry.actionId !== undefined && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={() => onRemove(entry.actionId!)}
          aria-label="Remove action"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </li>
  );
}
