/**
 * ShowFullChainToggle — bumps both depth caps to the maximum to
 * reveal every reachable upstream + downstream node. When the
 * resulting view would exceed 20 nodes, surfaces a confirm dialog
 * per `[AF-06]`.
 *
 * Note on UI primitive: the plan calls for a shadcn `AlertDialog`,
 * but that primitive isn't in this project's shipped UI set
 * (frontend/src/components/ui/). We use the available `Dialog`
 * primitive with destructive-style cancel/continue buttons —
 * equivalent UX and consistent with CLAUDE.md's "shadcn/ui only"
 * rule (no new component libraries).
 */
import { useState } from 'react';
import { Network, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ShowFullChainToggleProps {
  showFullChain: boolean;
  /** Total visible nodes when fully expanded — used to gate the warning. */
  fullyExpandedNodeCount: number;
  /** Reachable BFS depth on each side — disables when there's nothing more to show. */
  hasDeeperChain: boolean;
  onApply: (value: boolean) => void;
}

const WARNING_THRESHOLD = 20;

export function ShowFullChainToggle({
  showFullChain,
  fullyExpandedNodeCount,
  hasDeeperChain,
  onApply,
}: ShowFullChainToggleProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const disabled = !showFullChain && !hasDeeperChain;

  const handleClick = () => {
    if (showFullChain) {
      onApply(false);
      return;
    }
    if (fullyExpandedNodeCount > WARNING_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    onApply(true);
  };

  return (
    <>
      <Button
        variant={showFullChain ? 'default' : 'outline'}
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        className="h-7 text-[11px] gap-1.5"
        title={
          disabled
            ? 'Already fully expanded — nothing deeper to show.'
            : showFullChain
              ? 'Collapse back to direct neighbours (±1)'
              : 'Expand every reachable upstream and downstream entity'
        }
      >
        {showFullChain ? (
          <X className="h-3 w-3" />
        ) : (
          <Network className="h-3 w-3" />
        )}
        {showFullChain ? 'Collapse chain' : 'Show full chain'}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Show the full cascade?</DialogTitle>
            <DialogDescription>
              The fully expanded view will render{' '}
              <span className="font-semibold text-foreground">
                {fullyExpandedNodeCount} nodes
              </span>
              . Large cascades can take a moment to render and may overflow
              horizontally — scroll the canvas to see the deep tail. You can
              collapse back to ±1 with the same button.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onApply(true);
              }}
              size="sm"
            >
              Show full chain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
