/**
 * v5 B2 [B-PR-04] [B-PR-05] — PromotedBadge.
 *
 * Small visual marker next to a scenario action that has been
 * successfully promoted. Promoted actions remain in the scenario
 * (partial promotion is intentional) and stay editable, but the badge
 * clearly indicates that the diff has been mirrored to canonical data.
 *
 * Renders nothing for un-promoted actions (returns null) so consumers
 * can use it unconditionally.
 */

import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  /** ISO timestamp from `ScenarioAction.promoted_at`. Null/undefined → renders null. */
  promotedAt?: string | null;
  className?: string;
}

export function PromotedBadge({ promotedAt, className }: Props) {
  if (!promotedAt) return null;
  return (
    <Badge
      variant="outline"
      title={`Promoted ${promotedAt}`}
      className={`border-emerald-300 bg-emerald-50 text-[10px] uppercase tracking-wide text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 ${className ?? ''}`}
    >
      <CheckCircle2 className="mr-1 h-3 w-3" />
      Promoted
    </Badge>
  );
}
