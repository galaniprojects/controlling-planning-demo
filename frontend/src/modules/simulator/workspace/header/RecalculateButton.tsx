/**
 * v5 B2 — Recalculate button.
 *
 * Triggers the explicit recalc per spec line 1048: the impact
 * dashboard is server-side and explicit, never auto-refetched on diff
 * change. Disabled while a recalc is in flight.
 */

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  loading: boolean;
  stale: boolean;
  onClick: () => void;
}

export function RecalculateButton({ loading, stale, onClick }: Props) {
  return (
    <Button
      size="sm"
      variant={stale ? 'default' : 'outline'}
      onClick={onClick}
      disabled={loading}
    >
      <RefreshCw
        className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      {loading ? 'Recalculating…' : 'Recalculate'}
    </Button>
  );
}
