import { HeartPulse } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';

export function ServiceFinancialHealthTile() {
  return (
    <ActionCard title="Financial health">
      <EmptyState
        icon={HeartPulse}
        title="Coming in a later phase"
        description="Service forecast vs actuals lands with the financial-parity phase."
        size="sm"
      />
    </ActionCard>
  );
}
