import { Users } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';

export function ServiceResourcePlanTile() {
  return (
    <ActionCard title="Resource plan">
      <EmptyState
        icon={Users}
        title="Coming in a later phase"
        description="Resource planning for services lands with the financial-parity phase."
        size="sm"
      />
    </ActionCard>
  );
}
