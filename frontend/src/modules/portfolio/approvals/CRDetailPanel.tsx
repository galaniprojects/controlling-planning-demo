import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { DetailViewGrid } from '@/components/shared/DetailViewGrid';
import { DetailViewKPIStrip } from '@/components/shared/DetailViewKPIStrip';
import { Separator } from '@/components/ui/separator';
import { portfolioApi } from '@/api/endpoints';
import type { CRDetail } from '@/types/api';
import { Check, X, Edit2, Sparkles, Maximize2 } from 'lucide-react';

interface Props {
  crId: number;
  onActionComplete: () => void;
  onOpenDetail?: (crId: number) => void;
}

type ActionMode = 'idle' | 'approve' | 'reject';

export function CRDetailPanel({ crId, onActionComplete, onOpenDetail }: Props) {
  const [data, setData] = useState<CRDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode>('idle');
  const [actionText, setActionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setActionMode('idle');
    setActionText('');
    setActionResult(null);
    portfolioApi
      .getApprovalDetail(crId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [crId]);

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (actionMode === 'approve') {
        await portfolioApi.approveCR(crId, actionText || undefined);
        setActionResult('Change request approved. Forecast updated.');
      } else if (actionMode === 'reject') {
        await portfolioApi.rejectCR(crId, actionText);
        setActionResult('Change request rejected.');
      }
      onActionComplete();
    } catch {
      setActionResult('Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-60" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Change request not found.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.project_name}</p>
        <h3 className="text-base font-semibold text-foreground">{data.summary}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs capitalize">
            {data.change_category}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {data.status.replace(/_/g, ' ')}
          </Badge>
          {data.is_system_suggested && (
            <Badge className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              System Suggested
            </Badge>
          )}
        </div>
      </div>

      {/* Open Full Detail */}
      {onOpenDetail && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenDetail(crId)}>
          <Maximize2 className="h-3.5 w-3.5 mr-1" />
          Open Full Detail
        </Button>
      )}

      {/* Justification */}
      {data.justification && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Justification</p>
          <p className="text-sm text-muted-foreground">{data.justification}</p>
        </div>
      )}

      <Separator />

      {/* CC Owner Confirmation */}
      {data.cc_owner && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">CC Owner Confirmation</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confirmed by</span>
              <span className="text-foreground">{data.cc_owner}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="text-foreground capitalize">{data.cc_status?.replace(/_/g, ' ') || '—'}</span>
            </div>
            {data.cc_comments && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground">Comments</p>
                <p className="text-muted-foreground">{data.cc_comments}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* Changes — tabular detail view grid */}
      {data.grid_data ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Changes</p>
          <DetailViewGrid
            lineItems={data.grid_data.line_items}
            months={data.grid_data.months}
            cellPattern="comparison"
          />
          {data.grid_data.kpis && (
            <DetailViewKPIStrip kpis={data.grid_data.kpis} />
          )}
        </div>
      ) : data.changes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Changes</p>
          <div className="rounded-md border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">Field</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">Month</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-right">Old</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-right">New</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-right">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.changes.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-2 py-1.5 text-xs text-foreground">{c.field_changed}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-muted-foreground">{c.month || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-muted-foreground text-right">{c.old_value || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-foreground text-right font-medium">{c.new_value || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-right font-medium text-amber-600 dark:text-amber-400">{c.delta || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          {actionResult}
        </div>
      )}

      {/* Actions */}
      {!actionResult && (
        <div className="space-y-3 pt-2 border-t border-border">
          {actionMode === 'idle' ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setActionMode('approve')}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActionMode('reject')}
                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              {onOpenDetail && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenDetail(crId)}
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Request Changes
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground capitalize">
                {actionMode === 'approve' ? 'Comments (optional)' : 'Reason (required)'}
              </p>
              <Textarea
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder={actionMode === 'reject' ? 'Enter rejection reason...' : 'Enter comments...'}
                rows={3}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAction}
                  disabled={submitting || (actionMode !== 'approve' && !actionText.trim())}
                >
                  {submitting ? 'Submitting...' : 'Confirm'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setActionMode('idle');
                    setActionText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
