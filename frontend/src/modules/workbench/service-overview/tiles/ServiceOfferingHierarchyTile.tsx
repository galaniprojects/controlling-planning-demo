/**
 * Offering hierarchy tile (position 3,3) — Offerings only.
 *
 * Presentation-only. The parent (`ServiceOverviewTab`) owns the single
 * `adminApi.getActiveHierarchy()` fetch (also feeds the header tile's
 * hierarchy name) and passes the resolved `position` down to this tile
 * — pre-review this tile did its own duplicate fetch.
 *
 * Internal Services do not render this tile — the parent grid leaves
 * the 3,3 slot empty.
 *
 * Click navigates to the Admin → Portfolio Hierarchy panel.
 */
import { Network } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import type { NodePosition } from '../hierarchyHelpers';

interface Props {
  hierarchyNodeId: string | null;
  position: NodePosition | null;
  loading: boolean;
  error: string | null;
  onClick: () => void;
}

export function ServiceOfferingHierarchyTile({
  hierarchyNodeId,
  position,
  loading,
  error,
  onClick,
}: Props) {
  return (
    <ActionCard
      title="Offering hierarchy"
      loading={loading}
      error={error}
      onClick={onClick}
    >
      {!loading && !error && !hierarchyNodeId && (
        <EmptyState
          icon={Network}
          title="No hierarchy node set"
          description="Assign this offering to a hierarchy node in Administration → Chargeable Entities."
          size="sm"
        />
      )}
      {!loading && !error && hierarchyNodeId && !position && (
        <EmptyState
          icon={Network}
          title="Hierarchy node not found"
          description="The assigned node is not in the active hierarchy."
          size="sm"
        />
      )}
      {position && (
        <dl className="space-y-2 mt-2 text-xs">
          <div className="space-y-0.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {position.type_name}
            </dt>
            <dd className="text-sm font-medium text-foreground truncate" title={position.current_name}>
              {position.current_name}
            </dd>
          </div>
          {position.parent_name && (
            <div className="space-y-0.5 pt-2 border-t border-border">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Parent
              </dt>
              <dd className="text-foreground truncate" title={position.parent_name}>
                {position.parent_name}
              </dd>
            </div>
          )}
          {position.sibling_count > 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              {position.sibling_count} sibling{position.sibling_count === 1 ? '' : 's'} at this level
            </p>
          )}
        </dl>
      )}
    </ActionCard>
  );
}
