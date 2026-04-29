/**
 * CubeView — 3 side-by-side ScatterChart panels (one per T-level: T0/T1/T2).
 * [A-BK-19]
 */

import type { RankedProjectItem } from '@/types/api';
import { CubeScatterPanel } from './CubeScatterPanel';
import { CubeLegend } from './CubeLegend';
import { useFilteredRankedItems } from '../../hooks/useFilteredRankedItems';
import type { BacklogFilters, SortDir, SortField } from '../../BacklogContext';

interface Props {
  items: RankedProjectItem[];
  preFunded: RankedProjectItem[];
  filters: BacklogFilters;
  sortField: SortField | null;
  sortDir: SortDir;
}

export function CubeView({ items, preFunded, filters, sortField, sortDir }: Props) {
  const allItems = [...items, ...preFunded];

  const filtered = useFilteredRankedItems(items, filters, sortField, sortDir);

  const t0 = filtered.filter((i) => i.transformation_level === 'T0');
  const t1 = filtered.filter((i) => i.transformation_level === 'T1');
  const t2 = filtered.filter((i) => i.transformation_level === 'T2');
  // Projects with no T-level assigned
  const unassigned = filtered.filter((i) => !i.transformation_level);

  return (
    <div className="space-y-4">
      <CubeLegend />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CubeScatterPanel title="T0 — Just better" items={t0} allItems={allItems} />
        <CubeScatterPanel title="T1 — Paper to software" items={t1} allItems={allItems} />
        <CubeScatterPanel title="T2 — New business" items={t2} allItems={allItems} />
      </div>
      {unassigned.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {unassigned.length} project{unassigned.length !== 1 ? 's' : ''} have
          no T-level assigned and are not shown in the cube panels.
        </p>
      ) : null}
    </div>
  );
}
