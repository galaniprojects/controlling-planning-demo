import { Receipt } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';

export function ServiceExternalCostsTile() {
  return (
    <ActionCard title="External costs">
      <EmptyState
        icon={Receipt}
        title="Coming in a later phase"
        description="External-cost tracking for services lands with the financial-parity phase."
        size="sm"
      />
    </ActionCard>
  );
}
