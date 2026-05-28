/**
 * Shared helpers for the active-hierarchy lookups used by the service
 * tile grid. The header tile (1,1) needs just the resolved name; the
 * offering hierarchy tile (3,3) needs the full parent / siblings
 * context. Centralising the tree-walk avoids two parallel
 * `adminApi.getActiveHierarchy()` round-trips per Offering visit and
 * keeps the walk contract in one place.
 */
import { adminApi } from '@/api/endpoints';

export interface HierarchyEntity {
  id: string;
  name: string;
  entity_type_id: string;
  children: unknown[];
}

export interface ActiveHierarchy {
  entities: HierarchyEntity[];
  /** Map from `entity_type_id` to its human-readable label. */
  levelLabels: Map<string, string>;
}

export interface NodePosition {
  current_name: string;
  type_name: string;
  parent_name: string | null;
  sibling_count: number;
}

/**
 * Depth-first search for a hierarchy node by id. Returns the node + the
 * name of its parent (null at the root level) + the sibling array it
 * lives in (so callers can derive sibling_count by subtracting one).
 */
export function findNode(
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

export function resolveNodePosition(
  active: ActiveHierarchy,
  nodeId: string,
): NodePosition | null {
  const hit = findNode(active.entities, nodeId);
  if (!hit) return null;
  return {
    current_name: hit.entity.name,
    type_name: active.levelLabels.get(hit.entity.entity_type_id) ?? '—',
    parent_name: hit.parentName,
    sibling_count: hit.siblings.length - 1,
  };
}

export async function fetchActiveHierarchy(): Promise<ActiveHierarchy> {
  const res = await adminApi.getActiveHierarchy();
  const levelLabels = new Map<string, string>();
  for (const l of res.levels) {
    levelLabels.set(l.entity_type_id, l.entity_type_name);
  }
  return {
    entities: res.entities as unknown as HierarchyEntity[],
    levelLabels,
  };
}
