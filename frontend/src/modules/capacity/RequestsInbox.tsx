/**
 * RequestsInbox — placeholder skeleton for the Capacity Resource
 * Requests inbox (v5.2 Wave 2, Track B).
 *
 * Real implementation lands in Wave 3 (spec §12.2–§12.8). For now we
 * render a `ModuleHeader` and an `EmptyState`-style card so the route
 * is reachable, the breadcrumb works, and visual verification can
 * confirm the layout shell + nav strip render correctly.
 *
 * Route: `/capacity/requests`
 * Roles allowed: Controller, CC Owner. Executives and PLs are
 * filtered out by `CapacityModuleNav` (Executive) or by the parent
 * layout shell (PL).
 */
import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { EmptyState } from '@/components/shared/EmptyState';

export default function RequestsInbox() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Resource Requests"
        subtitle="Triage queue for incoming and re-confirmation requests"
      />
      <Card className="bg-card border-border">
        <EmptyState
          icon={Inbox}
          title="Requests inbox — implementation in Wave 3"
          description="The triage queue, filters, and recently-completed section land in v5.2 Wave 3 (spec §12.2–§12.8)."
        />
      </Card>
    </div>
  );
}
