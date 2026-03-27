import { useState, useEffect } from 'react';
import { adminApi } from '@/api/endpoints';
import type { FilterConfig } from '@/components/shared/FilterBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HierarchyLevel {
  level_order: number;
  entity_type_id: string;
  entity_type_name: string;
}

export interface HierarchyEntity {
  id: string;
  name: string;
  entity_type_id: string;
  project_count: number;
  children: HierarchyEntity[];
  projects: { id: string; name: string; status: string }[];
}

// ---------------------------------------------------------------------------
// Global cache
// ---------------------------------------------------------------------------

let cachedLabel: string | null = null;
let cachedEntities: { value: string; label: string }[] | null = null;
let cachedHasHierarchy: boolean | null = null;
let cachedLevels: HierarchyLevel[] | null = null;
let cachedEntityTree: HierarchyEntity[] | null = null;
let cachePromise: Promise<void> | null = null;

async function fetchAndCache() {
  try {
    const data = await adminApi.getActiveHierarchy();
    cachedLabel = data.top_level_label;
    cachedEntities = data.entities.map((e) => ({ value: e.id, label: e.name }));
    cachedHasHierarchy = data.hierarchy !== null && data.entities.length > 0;
    cachedLevels = data.levels ?? [];
    cachedEntityTree = (data.entities ?? []) as HierarchyEntity[];
  } catch {
    cachedLabel = 'Line of Business';
    cachedEntities = [];
    cachedHasHierarchy = false;
    cachedLevels = [];
    cachedEntityTree = [];
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that returns the active hierarchy's top-level label, entity options,
 * full levels array, and nested entity tree for multi-level filtering.
 */
export function useActiveHierarchy() {
  const [label, setLabel] = useState(cachedLabel || 'Line of Business');
  const [entityOpts, setEntityOpts] = useState<{ value: string; label: string }[]>(cachedEntities || []);
  const [hasHierarchy, setHasHierarchy] = useState(cachedHasHierarchy ?? false);
  const [levels, setLevels] = useState<HierarchyLevel[]>(cachedLevels || []);
  const [entityTree, setEntityTree] = useState<HierarchyEntity[]>(cachedEntityTree || []);
  const [isLoading, setIsLoading] = useState(!cachedLabel);

  useEffect(() => {
    if (cachedLabel && cachedEntities && cachedHasHierarchy !== null) {
      setLabel(cachedLabel);
      setEntityOpts(cachedEntities);
      setHasHierarchy(cachedHasHierarchy);
      setLevels(cachedLevels || []);
      setEntityTree(cachedEntityTree || []);
      setIsLoading(false);
      return;
    }

    if (!cachePromise) {
      cachePromise = fetchAndCache();
    }

    cachePromise.then(() => {
      setLabel(cachedLabel || 'Line of Business');
      setEntityOpts(cachedEntities || []);
      setHasHierarchy(cachedHasHierarchy ?? false);
      setLevels(cachedLevels || []);
      setEntityTree(cachedEntityTree || []);
      setIsLoading(false);
    });
  }, []);

  return {
    topLevelLabel: label,
    entityOptions: entityOpts,
    filterKey: (hasHierarchy ? 'grouping_entity' : 'lob') as 'grouping_entity' | 'lob',
    isLoading,
    levels,
    entityTree,
  };
}

/**
 * Invalidate the cache (call after hierarchy changes in admin).
 */
export function invalidateHierarchyCache() {
  cachedLabel = null;
  cachedEntities = null;
  cachedHasHierarchy = null;
  cachedLevels = null;
  cachedEntityTree = null;
  cachePromise = null;
}

// ---------------------------------------------------------------------------
// Multi-level filter builder
// ---------------------------------------------------------------------------

/**
 * Collect all entities of a given type from the nested tree.
 * If parentId is specified, only returns entities that are descendants of that parent.
 */
function collectEntitiesOfType(
  tree: HierarchyEntity[],
  targetTypeId: string,
  parentId?: string,
): { value: string; label: string }[] {
  const results: { value: string; label: string }[] = [];

  function walk(nodes: HierarchyEntity[], isUnderParent: boolean) {
    for (const node of nodes) {
      const matchesParent = isUnderParent || !parentId;
      const thisIsParent = node.id === parentId;

      if (matchesParent && node.entity_type_id === targetTypeId) {
        results.push({ value: node.id, label: node.name });
      }

      // Recurse into children — either we're already under the parent,
      // or this node IS the parent (so children are under it)
      if (matchesParent || thisIsParent) {
        walk(node.children || [], matchesParent || thisIsParent);
      } else {
        walk(node.children || [], false);
      }
    }
  }

  walk(tree, false);
  return results;
}

/**
 * Build FilterConfig array for all hierarchy levels.
 * Each level gets its own filter dropdown. When a higher level is selected,
 * lower-level options are scoped to descendants of the selection.
 *
 * @param levels        All hierarchy levels from useActiveHierarchy()
 * @param entityTree    Full nested entity tree from useActiveHierarchy()
 * @param currentFilters Current filter state (keys are 'hierarchy_0', 'hierarchy_1', etc.)
 * @param fallbackLobs  Fallback LoB list for when no hierarchy exists
 */
export function buildHierarchyFilterConfigs(
  levels: HierarchyLevel[],
  entityTree: HierarchyEntity[],
  currentFilters: Record<string, string>,
  fallbackLobs: { id: string; name: string }[],
): FilterConfig[] {
  if (!levels.length || !entityTree.length) {
    // Fallback: single LoB filter
    return [
      {
        key: 'lob',
        label: 'Line of Business',
        options: fallbackLobs.map((l) => ({ value: l.id, label: l.name })),
      },
    ];
  }

  const configs: FilterConfig[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];

    // Find the parent entity ID = the selected value from the level above
    const parentId = i > 0 ? currentFilters[`hierarchy_${i - 1}`] : undefined;

    // If a higher level exists but has no selection, still show all entities of this type
    const options = collectEntitiesOfType(entityTree, level.entity_type_id, parentId || undefined);

    // Only show this filter if it has options (or it's the first level)
    if (options.length > 0 || i === 0) {
      configs.push({
        key: `hierarchy_${i}`,
        label: level.entity_type_name,
        options,
      });
    }
  }

  return configs;
}

/**
 * From the current filter state, find the most specific (lowest-level)
 * hierarchy entity ID that has been selected. This is what gets sent
 * to the backend as the 'lob' query param.
 */
export function getMostSpecificEntityFilter(
  filters: Record<string, string>,
  levels: HierarchyLevel[],
): string | undefined {
  // Walk levels from bottom to top, return first non-empty value
  for (let i = levels.length - 1; i >= 0; i--) {
    const val = filters[`hierarchy_${i}`];
    if (val) return val;
  }
  return filters['lob'] || undefined;
}

/**
 * When a hierarchy filter at a given level changes, clear all lower-level
 * hierarchy filter values. Returns a new filters object.
 */
export function clearLowerHierarchyFilters(
  filters: Record<string, string>,
  changedKey: string,
  levels: HierarchyLevel[],
): Record<string, string> {
  const match = changedKey.match(/^hierarchy_(\d+)$/);
  if (!match) return filters;

  const changedLevel = parseInt(match[1], 10);
  const updated = { ...filters };

  for (let i = changedLevel + 1; i < levels.length; i++) {
    delete updated[`hierarchy_${i}`];
  }

  return updated;
}
