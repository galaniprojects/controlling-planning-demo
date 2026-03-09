import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { portfolioApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { CRDetail } from '@/types/api';
import { ArrowLeft, Check, X, Undo2, Sparkles } from 'lucide-react';

interface Props {
  crId: number;
  onBack: () => void;
  onActionComplete: () => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'send-back';

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

  // Compute total delta from changes
  const totalDelta = data.changes.reduce((sum, c) => {
    const d = parseFloat(c.delta || '0');
    return sum + (isNaN(d) ? 0 : d);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Approvals
      </Button>

      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{data.project_name}</p>
        <h2 className="text-xl font-semibold text-slate-800">{data.summary}</h2>
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
          <span className="text-sm text-slate-500">by {data.submitted_by}</span>
          <span className="text-sm text-slate-400">
            {new Date(data.submission_date).toLocaleDateString()}
          </span>
        </div>
      </div>

      <Separator />

      {/* Change Details Table */}
      {data.changes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Change Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-200 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs">Field</TableHead>
                    <TableHead className="px-3 py-2 text-xs">Month</TableHead>
                    <TableHead className="px-3 py-2 text-xs text-right">Old Value</TableHead>
                    <TableHead className="px-3 py-2 text-xs text-right">Proposed Value</TableHead>
                    <TableHead className="px-3 py-2 text-xs text-right">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.changes.map((c, i) => {
                    const delta = parseFloat(c.delta || '0');
                    return (
                      <TableRow key={i}>
                        <TableCell className="px-3 py-2 text-sm text-slate-700">{c.field_changed}</TableCell>
                        <TableCell className="px-3 py-2 text-sm text-slate-500">{c.month || '—'}</TableCell>
                        <TableCell className="px-3 py-2 text-sm text-slate-500 text-right">{c.old_value || '—'}</TableCell>
                        <TableCell className="px-3 py-2 text-sm text-slate-700 text-right font-medium">{c.new_value || '—'}</TableCell>
                        <TableCell className="px-3 py-2 text-sm text-right font-medium">
                          {c.delta ? (
                            <span className={delta > 0 ? 'text-red-600' : delta < 0 ? 'text-green-600' : 'text-slate-500'}>
                              {delta > 0 ? '+' : ''}{c.delta}
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Justification */}
      {data.justification && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Justification</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{data.justification}</p>
          </CardContent>
        </Card>
      )}

      {/* Impact Summary + CC Owner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Impact Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">Total Budget Delta</p>
                <p className={`text-lg font-semibold ${totalDelta > 0 ? 'text-red-600' : totalDelta < 0 ? 'text-green-600' : 'text-slate-800'}`}>
                  {totalDelta !== 0 ? formatCurrency(totalDelta) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Change Category</p>
                <p className="text-lg font-semibold text-slate-800 capitalize">{data.change_category}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.cc_owner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">CC Owner Confirmation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
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
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {actionResult}
        </div>
      )}

      {/* Action Buttons */}
      {!actionResult && (
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
                <Button size="sm" variant="outline" onClick={() => setActionMode('send-back')}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  Send Back
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-600">
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
