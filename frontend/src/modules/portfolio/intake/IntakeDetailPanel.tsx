import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/shared/Skeleton';
import { formatCurrency } from '@/lib/formatters';
import { useRole } from '@/contexts/RoleContext';
import { portfolioApi } from '@/api/endpoints';
import type { IntakeDetail } from '@/types/api';
import { Check, X, Undo2, Maximize2 } from 'lucide-react';

interface Props {
  projectId: string;
  onActionComplete: () => void;
  onOpenDetail?: (projectId: string) => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'send-back';

export function IntakeDetailPanel({ projectId, onActionComplete, onOpenDetail }: Props) {
  const { context } = useRole();
  const isController = context?.role === 'controller';

  const [data, setData] = useState<IntakeDetail | null>(null);
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
      .getIntakeDetail(projectId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleResubmit = async () => {
    setSubmitting(true);
    try {
      await portfolioApi.resubmitIntake(projectId);
      setActionResult('Project resubmitted for approval.');
      onActionComplete();
    } catch {
      setActionResult('Resubmit failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (actionMode === 'approve') {
        await portfolioApi.approveIntake(projectId, actionText || undefined);
        setActionResult('Project approved successfully.');
      } else if (actionMode === 'reject') {
        await portfolioApi.rejectIntake(projectId, actionText);
        setActionResult('Project rejected.');
      } else if (actionMode === 'send-back') {
        await portfolioApi.sendBackIntake(projectId, actionText);
        setActionResult('Project sent back for revision.');
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
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Project not found.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-slate-800">{data.name}</h3>
          <Badge variant="outline" className="text-xs capitalize">
            {data.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        {data.description && (
          <p className="text-sm text-slate-600">{data.description}</p>
        )}
      </div>

      {/* Open Full Detail */}
      {onOpenDetail && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenDetail(projectId)}>
          <Maximize2 className="h-3.5 w-3.5 mr-1" />
          Open Full Detail
        </Button>
      )}

      {/* Details */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-slate-500">Line of Business</p>
            <p className="text-slate-700">{data.lob_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">CapEx / OpEx</p>
            <p className="text-slate-700 capitalize">{data.capex_opex}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Start</p>
            <p className="text-slate-700">{data.start_month}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">End</p>
            <p className="text-slate-700">{data.end_month || '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-500">Estimated Budget</p>
            <p className="text-lg font-semibold text-slate-800">
              {data.estimated_budget != null ? formatCurrency(data.estimated_budget) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {actionResult}
        </div>
      )}

      {/* Resubmit (PL only, when changes_requested) */}
      {!isController && data.status === 'changes_requested' && !actionResult && (
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Changes requested by Controller. Review feedback above and resubmit when ready.
          </div>
          <Button size="sm" onClick={handleResubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Resubmit for Approval'}
          </Button>
        </div>
      )}

      {/* Actions (controller only) */}
      {isController && !actionResult && (
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
                Request Changes
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
