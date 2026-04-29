/**
 * v5 B2 [B-PR-05] — Apply-to-forecast button (PL only).
 *
 * Opens the ApplyConfirmModal. The button is gated by useCanApplyToForecast
 * (already enforced server-side as well).
 */

import { useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApplyConfirmModal } from './ApplyConfirmModal';
import { useScenarioContext } from '../useScenarioContext';

export function ApplyButton() {
  const [open, setOpen] = useState(false);
  const ctx = useScenarioContext();

  // Apply-to-forecast targets published scenarios per [B-PR-05]; show
  // a disabled button with a hint when the scenario isn't published.
  const detail = ctx.detail;
  const status = (detail?.metadata as unknown as { status?: string })?.status;
  const isPublished = status === 'published';

  return (
    <>
      <Button
        size="sm"
        variant="default"
        disabled={!isPublished}
        onClick={() => setOpen(true)}
        title={isPublished ? undefined : 'Only published scenarios can be applied'}
      >
        <ArrowDownToLine className="h-4 w-4 mr-1.5" aria-hidden="true" />
        Apply to forecast
      </Button>
      <ApplyConfirmModal open={open} onOpenChange={setOpen} />
    </>
  );
}
