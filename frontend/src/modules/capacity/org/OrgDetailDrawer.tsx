import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { capacityApi } from '@/api/endpoints';
import { Skeleton } from '@/components/shared/Skeleton';
import { Badge } from '@/components/ui/badge';
import type { OrgDetailItem } from '@/types/api';

interface OrgDetailDrawerProps {
  dimensionId: string;
  pivot: string;
  month?: string;
}

export function OrgDetailDrawer({ dimensionId, pivot, month }: OrgDetailDrawerProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrgDetailItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    capacityApi
      .getOrgHeatmapDetail(dimensionId, pivot, month)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [dimensionId, pivot, month]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">No project allocations for this period.</p>;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-600">Project Allocations</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Project</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Hours</th>
            <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">Pending CRs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.project_id} className="border-b border-slate-50">
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => navigate(`/workbench?project=${item.project_id}`)}
                  className="text-blue-700 hover:underline"
                >
                  {item.project_name}
                </button>
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {item.hours_allocated.toFixed(0)}h
              </td>
              <td className="px-3 py-2 text-center">
                {item.has_pending_crs && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    Pending
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
