/**
 * QuickRequestAction — v5.2 W4 Track C (spec §13.7), W6 S11 (slide-over §13.9)
 *
 * "Request this role" CTA button at the bottom of AvailabilitySidePanel.
 *
 * - Page mode (default): navigates to /workbench with pre-populated query
 *   params for the selected role and location.
 * - Slide-over mode (`onRequest` provided): invokes the parent callback so
 *   the wrapper can close the slide-over and populate the open Workbench
 *   request form. No navigation.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickRequestActionProps {
  roleTypeId: string;
  /** Location ID to pre-populate. Pass null / undefined for "all locations" context. */
  locationId?: string | null;
  /**
   * Slide-over override — when supplied, the button calls this instead of
   * navigating. The wrapper is responsible for closing the slide-over and
   * propagating the request to the host.
   */
  onRequest?: () => void;
  /**
   * Optional helper text override. Defaults to "Opens the resource request
   * form in the Workbench" (page mode wording).
   */
  helperText?: string;
}

export function QuickRequestAction({
  roleTypeId,
  locationId,
  onRequest,
  helperText,
}: QuickRequestActionProps) {
  const navigate = useNavigate();

  function handleRequest() {
    if (onRequest) {
      onRequest();
      return;
    }
    const params = new URLSearchParams();
    params.set('request_role', roleTypeId);
    if (locationId) {
      params.set('location', locationId);
    }
    navigate(`/workbench?${params.toString()}`);
  }

  return (
    <div className="border-t border-border pt-4 mt-4">
      <Button
        onClick={handleRequest}
        className="w-full gap-2"
        size="sm"
      >
        <ArrowRight className="h-4 w-4" />
        Request this role
      </Button>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {helperText ?? 'Opens the resource request form in the Workbench'}
      </p>
    </div>
  );
}
