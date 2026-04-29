/**
 * v5 B2 — Change-summary drawer.
 *
 * Slides in from the right and shows the optimistic change-summary
 * feed (per spec line 1048). Each entry is a recent diff with an
 * optional Remove action when the entry corresponds to a stored
 * `ScenarioAction` row.
 */

import type { ReactNode } from 'react';
import { History } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useScenarioContext } from '../useScenarioContext';
import { DiffEntry } from './DiffEntry';
import { PromoteApplyButtons } from './PromoteApplyButtons';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slot for T4's Promote button rendered in the drawer footer. */
  promoteSlot?: ReactNode;
}

export function ChangeSummaryDrawer({ open, onOpenChange, promoteSlot }: Props) {
  const ctx = useScenarioContext();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="px-3 pt-3 pb-2 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" aria-hidden="true" />
            Change summary
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {ctx.changeSummaryEntries.length === 0 ? (
            <p className="px-3 py-6 text-xs text-muted-foreground italic text-center">
              No diffs yet. Apply a lever or edit a sandbox surface to see
              changes here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {ctx.changeSummaryEntries.map((entry) => (
                <DiffEntry
                  key={entry.id}
                  entry={entry}
                  onRemove={(actionId) => {
                    void ctx.removeAction(actionId);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <PromoteApplyButtons>{promoteSlot}</PromoteApplyButtons>
      </SheetContent>
    </Sheet>
  );
}
