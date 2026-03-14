import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import type { CRHistoryItem } from '@/types/api';
import { ChevronDown, Sparkles } from 'lucide-react';
import { CRDetailModal } from './CRDetailModal';

interface Props {
  items: CRHistoryItem[];
  projectId: string;
}

export function CRHistoryList({ items, projectId }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCrId, setDetailCrId] = useState<number | null>(null);

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
                {/* Changes table */}
                {cr.changes.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-500 mb-1">
                      Changes
                    </h5>
                    <div className="border border-slate-200 rounded overflow-hidden bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field</TableHead>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Old</TableHead>
                            <TableHead className="text-right">New</TableHead>
                            <TableHead className="text-right">Delta</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cr.changes.map((ch, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                {ch.field}
                              </TableCell>
                              <TableCell className="text-sm">
                                {ch.month || '—'}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {ch.old || '—'}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {ch.new || '—'}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {ch.delta || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
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
