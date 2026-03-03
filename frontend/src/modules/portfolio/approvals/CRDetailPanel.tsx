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
import { Separator } from '@/components/ui/separator';
import { portfolioApi } from '@/api/endpoints';
import type { CRDetail } from '@/types/api';
import { Check, X, Undo2, Sparkles } from 'lucide-react';

interface Props {
  crId: number;
  onActionComplete: () => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'send-back';

export function CRDetailPanel({ crId, onActionComplete }: Props) {
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
      } else if (actionMode === 'send-back') {
        await portfolioApi.sendBackCR(crId, actionText);
        setActionResult('Change request sent back for revision.');
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
    return <p className="text-sm text-slate-400">Change request not found.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{data.project_name}</p>
        <h3 className="text-base font-semibold text-slate-800">{data.summary}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs capitalize">
            {data.change_category}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {data.status.replace(/_/g, ' ')}
          </Badge>
          {data.is_system_suggested && (
            <Badge className="bg-indigo-100 text-indigo-700 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              System Suggested
            </Badge>
          )}
        </div>
      </div>

      {/* Justification */}
      {data.justification && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Justification</p>
          <p className="text-sm text-slate-600">{data.justification}</p>
        </div>
      )}

      <Separator />

      {/* CC Owner Confirmation */}
      {data.cc_owner && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">CC Owner Confirmation</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Confirmed by</span>
              <span className="text-slate-700">{data.cc_owner}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="text-slate-700 capitalize">{data.cc_status?.replace(/_/g, ' ') || '—'}</span>
            </div>
            {data.cc_comments && (
              <div className="pt-1">
                <p className="text-xs text-slate-500">Comments</p>
                <p className="text-slate-600">{data.cc_comments}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* Changes Table */}
      {data.changes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Changes</p>
          <div className="rounded-md border border-slate-200 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-slate-500">Field</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-slate-500">Month</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-slate-500 text-right">Old</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-slate-500 text-right">New</TableHead>
                  <TableHead className="px-2 py-1.5 text-[11px] font-medium text-slate-500 text-right">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.changes.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-2 py-1.5 text-xs text-slate-700">{c.field_changed}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-slate-500">{c.month || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-slate-500 text-right">{c.old_value || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-slate-700 text-right font-medium">{c.new_value || '—'}</TableCell>
                    <TableCell className="px-2 py-1.5 text-xs text-right font-medium text-amber-600">{c.delta || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {actionResult}
        </div>
      )}

      {/* Actions */}
      {!actionResult && (
        <div className="space-y-3 pt-2 border-t border-slate-200">
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
                className="text-red-600 hover:text-red-700"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActionMode('send-back')}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Send Back
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 capitalize">
                {actionMode === 'approve' ? 'Comments (optional)' : actionMode === 'reject' ? 'Reason (required)' : 'Comments (required)'}
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
