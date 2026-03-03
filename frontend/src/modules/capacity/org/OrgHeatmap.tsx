import { useState, useEffect, useMemo } from 'react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import type { OrgHeatmapRow } from '@/types/api';
import { HeatmapGrid, type HeatmapRow } from '../shared/HeatmapGrid';

interface OrgHeatmapProps {
  pivot: string;
  onRowClick: (row: { id: string; label: string }) => void;
  onCellClick: (row: { id: string; label: string }, month: string) => void;
}

function normalizeRows(items: OrgHeatmapRow[]): HeatmapRow[] {
  return items.map((r) => ({
    id: r.id,
    label: r.name,
    utilization: r.utilization,
    isAggregate: false,
  }));
}

export function OrgHeatmap({ pivot, onRowClick, onCellClick }: OrgHeatmapProps) {
  const [data, setData] = useState<OrgHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getOrgHeatmap(pivot)
      .then((res) => setData(res.items))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [pivot]);

  const rows = useMemo(() => normalizeRows(data), [data]);
  const months = useMemo(
    () => (data.length > 0 ? data[0].utilization.map((c) => c.month) : []),
    [data],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No organization data available.</p>;
  }

  return (
    <HeatmapGrid
      rows={rows}
      months={months}
      onRowClick={(row) => onRowClick({ id: row.id, label: row.label })}
      onCellClick={(row, month) => onCellClick({ id: row.id, label: row.label }, month)}
    />
  );
}
