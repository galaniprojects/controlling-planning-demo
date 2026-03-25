import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/shared/Skeleton';
import { DetailViewGrid } from '@/components/shared/DetailViewGrid';
import { DetailViewKPIStrip } from '@/components/shared/DetailViewKPIStrip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { portfolioApi } from '@/api/endpoints';
import type { CRDetail } from '@/types/api';
import { ArrowLeft, Check, X, Edit2, Sparkles } from 'lucide-react';
import { EditableCRGrid } from './EditableCRGrid';

interface Props {
  crId: number;
  onBack: () => void;
  onActionComplete: () => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'edit-grid';

export function CRDetailWorkspace({ crId, onBack, onActionComplete }: Props) {
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
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-slate-400">Change request not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Approvals
        </Button>
        <span>/</span>
        <span className="text-slate-700 font-medium truncate">{data.summary}</span>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-800">{data.summary}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={data.status} />
          <Badge variant="outline" className="text-xs capitalize">
            {data.change_category.replace(/_/g, ' ')}
          </Badge>
          {data.is_system_suggested && (
            <Badge className="bg-indigo-100 text-indigo-700 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              System Suggested
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm max-w-lg">
          <div className="text-slate-500">Project</div>
          <div className="text-slate-700 font-medium">{data.project_name}</div>
          <div className="text-slate-500">Submitted by</div>
          <div className="text-slate-700">
            {data.submitted_by}
            <span className="text-slate-400 ml-2">
              {new Date(data.submission_date).toLocaleDateString()}
            </span>
          </div>
          {data.cc_owner && (
            <>
              <div className="text-slate-500">Confirmed by (CC Owner)</div>
              <div className="text-slate-700">
                {data.cc_owner}
                {data.cc_status && (
                  <span className="text-slate-400 ml-2 capitalize">
                    ({data.cc_status})
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Detail View Grid (read-only, shown when NOT in edit-grid mode) */}
      {actionMode !== 'edit-grid' && (
        <>
          {data.grid_data ? (
            <div className="space-y-4">
              <DetailViewGrid
                lineItems={data.grid_data.line_items}
                months={data.grid_data.months}
                cellPattern="comparison"
              />
              <DetailViewKPIStrip kpis={data.grid_data.kpis} />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Change Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">
                  This change request does not contain monthly value changes for grid display.
                </p>
                <ul className="mt-2 space-y-1">
                  {data.changes.map((c, i) => (
                    <li key={i} className="text-sm text-slate-600">
                      {c.field_changed}: {c.old_value ?? '\u2014'} → {c.new_value ?? '\u2014'}
                      {c.month && <span className="text-slate-400 ml-1">({c.month})</span>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Justification */}
      {data.justification && actionMode !== 'edit-grid' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Justification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{data.justification}</p>
          </CardContent>
        </Card>
      )}

      {/* CC Owner Comments */}
      {data.cc_comments && actionMode !== 'edit-grid' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">CC Owner Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{data.cc_comments}</p>
          </CardContent>
        </Card>
      )}

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {actionResult}
        </div>
      )}

      {/* Editable Grid (controller requesting changes) */}
      {actionMode === 'edit-grid' && (
        <EditableCRGrid
          crId={crId}
          onConfirm={async (comments, changes) => {
            await portfolioApi.sendBackCR(crId, comments, changes);
            setActionResult('Changes sent to Project Lead for review.');
            setActionMode('idle');
            onActionComplete();
          }}
          onCancel={() => setActionMode('idle')}
        />
      )}

      {/* Action Buttons */}
      {!actionResult && actionMode !== 'edit-grid' && (
        <Card>
          <CardContent className="pt-6">
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
                <Button size="sm" variant="outline" onClick={() => setActionMode('edit-grid')}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Request Changes
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">
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
                    onClick={() => { setActionMode('idle'); setActionText(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
