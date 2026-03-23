import { useState, useEffect } from 'react';
import { adminApi, referenceApi } from '@/api/endpoints';

interface HierarchyEntity {
  id: string;
  name: string;
  project_count: number;
}

interface ActiveHierarchyInfo {
  topLevelLabel: string;
  entities: HierarchyEntity[];
  isLoading: boolean;
}

let cachedLabel: string | null = null;
let cachedEntities: { value: string; label: string }[] | null = null;
let cachePromise: Promise<void> | null = null;

async function fetchAndCache() {
  try {
    const data = await adminApi.getActiveHierarchy();
    cachedLabel = data.top_level_label;
    cachedEntities = data.entities.map((e) => ({ value: e.id, label: e.name }));
  } catch {
    // Fallback to LoB data
    cachedLabel = 'Line of Business';
    try {
      const lobs = await referenceApi.getLobs();
      cachedEntities = lobs.items.map((l) => ({ value: l.id, label: l.name }));
    } catch {
      cachedEntities = [];
    }
  }
}

/**
 * Hook that returns the active hierarchy's top-level label and entity options.
 * Caches the result to avoid re-fetching on every mount.
 */
export function useActiveHierarchy(): ActiveHierarchyInfo & { entityOptions: { value: string; label: string }[] } {
  const [label, setLabel] = useState(cachedLabel || 'Line of Business');
  const [entities, setEntities] = useState<HierarchyEntity[]>([]);
  const [entityOpts, setEntityOpts] = useState<{ value: string; label: string }[]>(cachedEntities || []);
  const [isLoading, setIsLoading] = useState(!cachedLabel);

  useEffect(() => {
    if (cachedLabel && cachedEntities) {
      setLabel(cachedLabel);
      setEntityOpts(cachedEntities);
      setIsLoading(false);
      return;
    }

    if (!cachePromise) {
      cachePromise = fetchAndCache();
    }

    cachePromise.then(() => {
      setLabel(cachedLabel || 'Line of Business');
      setEntityOpts(cachedEntities || []);
      setIsLoading(false);
    });
  }, []);

  return { topLevelLabel: label, entities, entityOptions: entityOpts, isLoading };
}

/**
 * Invalidate the cache (call after hierarchy changes in admin).
 */
export function invalidateHierarchyCache() {
  cachedLabel = null;
  cachedEntities = null;
  cachePromise = null;
}
