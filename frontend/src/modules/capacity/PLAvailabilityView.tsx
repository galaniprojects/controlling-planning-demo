/**
 * PLAvailabilityView — placeholder skeleton for the Project Lead
 * read-only availability view (v5.2 Wave 2, Track B).
 *
 * Real implementation lands in Wave 4 (spec §13). For now we render a
 * `ModuleHeader` and an `EmptyState`-style card so PLs hitting
 * `/capacity/availability` (their landing route) see a coherent page
 * and visual verification can confirm the route resolves.
 *
 * Route: `/capacity/availability`
 * Roles allowed: Project Lead (read-only). Other roles use the full
 * workspace at `/capacity` and don't see this route in their nav.
 *
 * Note: this view is also reused inside the Workbench as a slide-over
 * panel ("Check availability" link from the resource request flow);
 * that wrapper (`PLAvailabilitySlideOver`) lands in Wave 4.
 */
import { CalendarRange } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { EmptyState } from '@/components/shared/EmptyState';

export default function PLAvailabilityView() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Resource Availability"
        subtitle="Browse availability before submitting a resource request"
      />
      <Card className="bg-card border-border">
        <EmptyState
          icon={CalendarRange}
          title="PL availability — implementation in Wave 4"
          description="The role-filtered availability grid and slide-over integration with the Workbench land in v5.2 Wave 4 (spec §13)."
        />
      </Card>
    </div>
  );
}
