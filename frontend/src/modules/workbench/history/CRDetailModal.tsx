import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailViewGrid } from '@/components/shared/DetailViewGrid';
import { DetailViewKPIStrip } from '@/components/shared/DetailViewKPIStrip';
import { Skeleton } from '@/components/shared/Skeleton';
import { Sparkles } from 'lucide-react';
import { workbenchApi } from '@/api/endpoints';
import type { DetailViewGridData } from '@/lib/detailViewTypes';

interface Props {
  projectId: string;
  crId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CRDetailData {
  cr_id: number;
  project_name: string;
  summary: string;
  status: string;
  change_category: string;
  justification: string | null;
  is_system_suggested: boolean;
  submitted_by: string;
  submission_date: string;
  decided_by: string | null;
  decided_date: string | null;
  grid_data: DetailViewGridData | null;
}

export function CRDetailModal({ projectId, crId, open, onOpenChange }: Props) {
  const [data, setData] = useState<CRDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    workbenchApi
      .getCRDetailView(projectId, crId)
      .then((res) => setData(res as CRDetailData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, projectId, crId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="space-y-2">
            {loading ? (
              <Skeleton className="h-6 w-64" />
            ) : data ? (
              <>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{data.project_name}</span>
                  <span>/</span>
                  <span>Change History</span>
                  <span>/</span>
                  <span>CR #{data.cr_id}</span>
                </div>
                <DialogTitle className="flex items-center gap-2">
                  {data.summary}
                  {data.is_system_suggested && (
                    <Sparkles className="h-4 w-4 text-blue-500" />
                  )}
                </DialogTitle>
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge status={data.status} />
                  <Badge variant="outline" className="text-xs capitalize">
                    {data.change_category.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Submitted by {data.submitted_by} on{' '}
                    {data.submission_date?.split(' ')[0]}
                  </span>
                  {data.decided_by && (
                    <span className="text-xs text-slate-400">
                      Decided by {data.decided_by}
                      {data.decided_date && ` on ${data.decided_date.split(' ')[0]}`}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <DialogTitle>Change Request Detail</DialogTitle>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : data?.grid_data ? (
            <>
              <DetailViewGrid
                lineItems={data.grid_data.line_items}
                months={data.grid_data.months}
                cellPattern="comparison"
              />
              <DetailViewKPIStrip kpis={data.grid_data.kpis} />
            </>
          ) : (
            <p className="text-sm text-slate-400 py-4">
              No detailed grid data available for this change request.
            </p>
          )}

          {data?.justification && (
            <div className="border-t border-slate-200 pt-3">
              <h4 className="text-xs font-medium text-slate-500 mb-1">
                Justification
              </h4>
              <p className="text-sm text-slate-600">{data.justification}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
