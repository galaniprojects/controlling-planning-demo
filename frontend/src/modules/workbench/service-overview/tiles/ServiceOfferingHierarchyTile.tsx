/**
 * Offering hierarchy tile (position 3,3) — Offerings only.
 *
 * Shows the offering's parent / current / sibling-count position within
 * the active grouping hierarchy. Internal Services do not render this
 * tile — the parent grid leaves the 3,3 slot empty.
 *
 * Click navigates to the Admin → Portfolio Hierarchy panel where the
 * offering tree lives.
 */
import { useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { adminApi } from '@/api/endpoints';

interface Props {
  hierarchyNodeId: string | null;
  onClick: () => void;
}

interface NodePosition {
  current_name: string;
  type_name: string;
  parent_name: string | null;
  sibling_count: number;
}

interface HierarchyEntity {
  id: string;
  name: string;
  entity_type_id: string;
  children: unknown[];
}

function findNode(
  entities: HierarchyEntity[],
  targetId: string,
  parentName: string | null = null,
  siblings: HierarchyEntity[] = entities,
): { entity: HierarchyEntity; parentName: string | null; siblings: HierarchyEntity[] } | null {
  for (const e of entities) {
    if (e.id === targetId) {
      return { entity: e, parentName, siblings };
    }
    const children = (e.children as HierarchyEntity[]) ?? [];
    const hit = findNode(children, targetId, e.name, children);
    if (hit) return hit;
  }
  return null;
}

export function ServiceOfferingHierarchyTile({
  hierarchyNodeId,
  onClick,
}: Props) {
  const [position, setPosition] = useState<NodePosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hierarchyNodeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .getActiveHierarchy()
      .then((res) => {
        if (cancelled) return;
        const levelLabels = new Map<string, string>();
        for (const l of res.levels) {
          levelLabels.set(l.entity_type_id, l.entity_type_name);
        }
        const entities = res.entities as unknown as HierarchyEntity[];
        const hit = findNode(entities, hierarchyNodeId);
        if (!hit) {
          setPosition(null);
          return;
        }
        setPosition({
          current_name: hit.entity.name,
          type_name: levelLabels.get(hit.entity.entity_type_id) ?? '—',
          parent_name: hit.parentName,
          sibling_count: hit.siblings.length - 1,
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load hierarchy');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hierarchyNodeId]);

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
