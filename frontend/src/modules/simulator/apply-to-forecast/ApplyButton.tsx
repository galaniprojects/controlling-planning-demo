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

  // Apply-to-forecast is allowed when the user OWNS the scenario (any
  // status, incl. private) OR the scenario is PUBLISHED — matching the
  // backend gate in scenario_apply_forecast.apply_to_forecast. Show a
  // disabled button with a hint reflecting the real reason otherwise.
  const detail = ctx.detail;
  const status = (detail?.metadata as unknown as { status?: string })?.status;
  const isPublished = status === 'published';
  const isOwner = ctx.isOwner;
  const canApply = isOwner || isPublished;

  return (
    <>
      <Button
        size="sm"
        variant="default"
        disabled={!canApply}
        onClick={() => setOpen(true)}
        title={
          canApply
            ? undefined
            : 'You can only apply scenarios you own or that are published'
        }
      >
        <ArrowDownToLine className="h-4 w-4 mr-1.5" aria-hidden="true" />
        Apply to forecast
      </Button>
      <ApplyConfirmModal open={open} onOpenChange={setOpen} />
    </>
  );
}
