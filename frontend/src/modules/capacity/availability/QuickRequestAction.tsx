/**
 * QuickRequestAction — v5.2 W4 Track C (spec §13.7)
 *
 * "Request this role" CTA button at the bottom of AvailabilitySidePanel.
 * Navigates to /workbench with pre-populated query params for the selected
 * role and location. The slide-over integration (Workbench context) lands in
 * Wave 6 Session 11 — this component only handles the standalone full-page CTA.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickRequestActionProps {
  roleTypeId: string;
  /** Location ID to pre-populate. Pass null / undefined for "all locations" context. */
  locationId?: string | null;
}

export function QuickRequestAction({ roleTypeId, locationId }: QuickRequestActionProps) {
  const navigate = useNavigate();

  function handleRequest() {
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
        Opens the resource request form in the Workbench
      </p>
    </div>
  );
}
