import { useState, useEffect, useMemo } from 'react';
import { capacityApi } from '@/api/endpoints';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/shared/Skeleton';
import { useBottomDrawer } from '@/contexts/BottomDrawerContext';
import type { OrgSummary, OrgHeatmapRow } from '@/types/api';
import { OrgSummaryBar } from './OrgSummaryBar';
import { OrgHeatmap } from './OrgHeatmap';
import { OrgDetailDrawer } from './OrgDetailDrawer';

export function OrgOverviewTab() {
  const { openDrawer } = useBottomDrawer();
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pivot, setPivot] = useState('cost_center');

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getOrgSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  const handleCellClick = (row: { id: string; label: string }, month: string) => {
    openDrawer(
      `${row.label} — ${month}`,
      <OrgDetailDrawer dimensionId={row.id} pivot={pivot} month={month} />,
    );
  };

  const handleRowClick = (row: { id: string; label: string }) => {
    openDrawer(
      row.label,
      <OrgDetailDrawer dimensionId={row.id} pivot={pivot} />,
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-muted-foreground">Failed to load organization data.</p>;
  }

  return (
    <div className="space-y-5">
      <OrgSummaryBar data={summary} />

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">View by:</label>
        <Select value={pivot} onValueChange={setPivot}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cost_center">Cost Center</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="lob">Line of Business</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <OrgHeatmap
        pivot={pivot}
        onRowClick={handleRowClick}
        onCellClick={handleCellClick}
      />
    </div>
  );
}
