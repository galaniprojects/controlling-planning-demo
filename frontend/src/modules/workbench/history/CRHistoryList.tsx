import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailViewGrid } from '@/components/shared/DetailViewGrid';
import { DetailViewKPIStrip } from '@/components/shared/DetailViewKPIStrip';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';
import type { CRHistoryItem } from '@/types/api';
import type { DetailViewGridData } from '@/lib/detailViewTypes';
import { ChevronDown, Sparkles } from 'lucide-react';
import { CRDetailModal } from './CRDetailModal';
import { workbenchApi } from '@/api/endpoints';

interface Props {
  items: CRHistoryItem[];
  projectId: string;
}

interface CRGridCache {
  [crId: number]: { loading: boolean; data: DetailViewGridData | null };
}

export function CRHistoryList({ items, projectId }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCrId, setDetailCrId] = useState<number | null>(null);
  const [gridCache, setGridCache] = useState<CRGridCache>({});

  // Fetch grid_data when a CR is expanded
  useEffect(() => {
    if (expandedId === null) return;
    if (gridCache[expandedId]) return; // already fetched

    setGridCache((prev) => ({
      ...prev,
      [expandedId]: { loading: true, data: null },
    }));

    workbenchApi
      .getCRDetailView(projectId, expandedId)
      .then((res) => {
        setGridCache((prev) => ({
          ...prev,
          [expandedId]: { loading: false, data: (res as { grid_data: DetailViewGridData | null }).grid_data },
        }));
      })
      .catch(() => {
        setGridCache((prev) => ({
          ...prev,
          [expandedId]: { loading: false, data: null },
        }));
      });
  }, [expandedId, projectId, gridCache]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-4">
        No change requests found.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((cr) => {
        const isExpanded = expandedId === cr.id;
        const cached = gridCache[cr.id];
        return (
          <div
            key={cr.id}
            className="border border-slate-200 rounded-lg overflow-hidden"
          >
            {/* Summary row */}
            <button
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : cr.id)}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-400 transition-transform shrink-0',
                  isExpanded && 'rotate-180',
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-700">
                    {cr.summary}
                  </span>
                  {cr.is_system_suggested && (
                    <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span>{cr.submission_date?.split(' ')[0]}</span>
                  <span>by {cr.submitted_by}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {cr.change_category.replace('_', ' ')}
                </Badge>
                <StatusBadge status={cr.status} />
              </div>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 space-y-3">
                {/* Grid data or loading */}
                {cached?.loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : cached?.data ? (
                  <div className="space-y-2">
                    <DetailViewGrid
                      lineItems={cached.data.line_items}
                      months={cached.data.months}
                      cellPattern="comparison"
                    />
                    {cached.data.kpis && (
                      <DetailViewKPIStrip kpis={cached.data.kpis} />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No detailed grid data available for this change request.
                  </p>
                )}

                {/* Justification */}
                {cr.justification && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-500 mb-1">
                      Justification
                    </h5>
                    <p className="text-sm text-slate-600">{cr.justification}</p>
                  </div>
                )}

                {/* System suggested */}
                {cr.is_system_suggested && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600">
                    <Sparkles className="h-3.5 w-3.5" />
                    System-suggested change
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setDetailCrId(cr.id)}
                >
                  View Full Detail
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {detailCrId !== null && (
        <CRDetailModal
          projectId={projectId}
          crId={detailCrId}
          open={detailCrId !== null}
          onOpenChange={(open) => { if (!open) setDetailCrId(null); }}
        />
      )}
    </div>
  );
}
