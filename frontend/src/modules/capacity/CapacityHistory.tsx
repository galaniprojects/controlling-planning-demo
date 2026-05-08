/**
 * CapacityHistory — placeholder skeleton for the Capacity audit trail
 * (v5.2 Wave 2, Track B).
 *
 * Real implementation lands in Wave 3 (spec §12.9–§12.15). For now we
 * render a `ModuleHeader` and an `EmptyState`-style card so the route
 * is reachable and the layout shell + nav strip can be visually
 * verified.
 *
 * Route: `/capacity/history`
 * Roles allowed: Controller, CC Owner, Executive. PLs are filtered
 * out by the parent layout shell (they're routed to
 * `/capacity/availability`).
 */
import { History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { EmptyState } from '@/components/shared/EmptyState';

export default function CapacityHistory() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Capacity History"
        subtitle="Audit trail of capacity actions across the organization"
      />
      <Card className="bg-card border-border">
        <EmptyState
          icon={History}
          title="Audit history — implementation in Wave 3"
          description="The chronological action log and history filters land in v5.2 Wave 3 (spec §12.9–§12.15)."
        />
      </Card>
    </div>
  );
}
