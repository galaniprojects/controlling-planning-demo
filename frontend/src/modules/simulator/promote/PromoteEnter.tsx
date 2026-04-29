/**
 * v5 B2 [B-PR-01] [B-PR-02] [B-PR-06] — PromoteEnter.
 *
 * Header / drawer entry point that takes the user into the Promote
 * Review page. Gated by:
 *  - `useCanPromote()` — controller-only (per `[B-PR-06]`).
 *  - Anchor-stale check (per `[B-PR-02]`) — disabled with tooltip
 *    "Rebase to the latest forecast cycle before promoting" when the
 *    scenario's anchor != latest cycle. The actual stale detection
 *    happens server-side at preview time; the frontend renders an
 *    advisory hint based on the most recent recalculate response.
 *
 * Renders nothing when the user is not a controller — hidden DOM, not
 * disabled, mirrors the Tier-3 pattern for sensitive actions.
 */

import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanPromote } from '../permissions';
import { useScenarioContext } from '../useScenarioContext';

interface Props {
  /**
   * Optional pre-computed staleness flag — used by the workspace header
   * which already knows the rebase state from the impact response.
   * When omitted, the button is enabled and stale-detection happens at
   * preview time on the server.
   */
  anchorStale?: boolean;
  /** Where to send the user. Defaults to `/simulator/scenarios/{id}/promote`. */
  promoteRoute?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm';
  /** Extra className for layout. */
  className?: string;
}

export function PromoteEnter({
  anchorStale,
  promoteRoute,
  variant = 'default',
  size = 'sm',
  className,
}: Props) {
  const navigate = useNavigate();
  const canPromote = useCanPromote();
  const { scenarioId, archived } = useScenarioContext();

  if (!canPromote) return null;

  const disabled = Boolean(anchorStale) || archived;
  const route = promoteRoute ?? `/simulator/scenarios/${scenarioId}/promote`;

  const tooltip = archived
    ? 'Cannot promote an archived scenario.'
    : anchorStale
      ? 'Rebase to the latest forecast cycle before promoting.'
      : undefined;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={() => navigate(route)}
      className={className}
      title={tooltip}
    >
      <Send className="mr-2 h-4 w-4" />
      Promote
    </Button>
  );
}
