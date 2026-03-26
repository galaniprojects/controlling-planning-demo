import { useState, useEffect } from 'react';
import { adminApi } from '@/api/endpoints';

let cachedLabel: string | null = null;
let cachedEntities: { value: string; label: string }[] | null = null;
let cachedHasHierarchy: boolean | null = null;
let cachePromise: Promise<void> | null = null;

async function fetchAndCache() {
  try {
    const data = await adminApi.getActiveHierarchy();
    cachedLabel = data.top_level_label;
    cachedEntities = data.entities.map((e) => ({ value: e.id, label: e.name }));
    cachedHasHierarchy = data.hierarchy !== null && data.entities.length > 0;
  } catch {
    cachedLabel = 'Line of Business';
    cachedEntities = [];
    cachedHasHierarchy = false;
  }
}

/**
 * Hook that returns the active hierarchy's top-level label and entity options.
 * Filter key is always 'grouping_entity' — the backend resolves entity IDs
 * via project_grouping_assignments.
 */
export function useActiveHierarchy() {
  const [label, setLabel] = useState(cachedLabel || 'Line of Business');
  const [entityOpts, setEntityOpts] = useState<{ value: string; label: string }[]>(cachedEntities || []);
  const [hasHierarchy, setHasHierarchy] = useState(cachedHasHierarchy ?? false);
  const [isLoading, setIsLoading] = useState(!cachedLabel);

  useEffect(() => {
    if (cachedLabel && cachedEntities && cachedHasHierarchy !== null) {
      setLabel(cachedLabel);
      setEntityOpts(cachedEntities);
      setHasHierarchy(cachedHasHierarchy);
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
      setIsLoading(false);
    });
  }, []);

  return {
    topLevelLabel: label,
    entityOptions: entityOpts,
    filterKey: (hasHierarchy ? 'grouping_entity' : 'lob') as 'grouping_entity' | 'lob',
    isLoading,
  };
}

/**
 * Invalidate the cache (call after hierarchy changes in admin).
 */
export function invalidateHierarchyCache() {
  cachedLabel = null;
  cachedEntities = null;
  cachedHasHierarchy = null;
  cachePromise = null;
}
