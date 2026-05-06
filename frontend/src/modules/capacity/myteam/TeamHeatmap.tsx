import { useState, useEffect, useMemo } from 'react';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import type { RoleHeatmapRow } from '@/types/api';
import { HeatmapGrid, type HeatmapRow } from '../shared/HeatmapGrid';

interface TeamHeatmapProps {
  ccId: string;
  onPersonClick: (personId: string, personName: string) => void;
}

function normalizeRows(roles: RoleHeatmapRow[]): HeatmapRow[] {
  return roles.map((r) => {
    const peopleRows: HeatmapRow[] = r.people.map((p) => ({
      id: p.person_id,
      label: p.name,
      utilization: p.utilization,
      isAggregate: false,
    }));

    // v5.1 C-07 — append a synthetic 'External' child row when the role
    // has external-cost forecast lines tagged with role_type_id == role_id.
    if (r.external) {
      const ext = r.external;
      const tooltips = ext.fte_equivalent.map((c) =>
        c.value > 0
          ? `${c.value.toFixed(2)} FTE-equivalent (sum of external €/month ÷ hourly rate ÷ 160h)`
          : 'No external spend with role assignment this month',
      );
      peopleRows.push({
        id: `${r.role_id}__external`,
        label: ext.label,
        utilization: ext.fte_equivalent,
        isAggregate: false,
        isExternal: true,
        cellFormat: 'fte',
        cellTooltips: tooltips,
      });
    }

    return {
      id: r.role_id,
      label: r.role_name,
      utilization: r.aggregate_utilization,
      isAggregate: true,
      children: peopleRows,
    };
  });
}

export function TeamHeatmap({ ccId, onPersonClick }: TeamHeatmapProps) {
  const [data, setData] = useState<RoleHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getTeamHeatmap(ccId)
      .then((res) => setData(res.items))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ccId]);

  const rows = useMemo(() => normalizeRows(data), [data]);
  const months = useMemo(
    () => (data.length > 0 ? data[0].aggregate_utilization.map((c) => c.month) : []),
    [data],
  );

  // Default expand all roles so people are visible
  const defaultExpanded = useMemo(
    () => new Set(data.map((r) => r.role_id)),
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
    return <p className="text-sm text-muted-foreground">No team data available.</p>;
  }

  return (
    <HeatmapGrid
      rows={rows}
      months={months}
      expandable
      defaultExpanded={defaultExpanded}
      onRowClick={(row) => {
        if (!row.isAggregate) {
          onPersonClick(row.id, row.label);
        }
      }}
    />
  );
}
