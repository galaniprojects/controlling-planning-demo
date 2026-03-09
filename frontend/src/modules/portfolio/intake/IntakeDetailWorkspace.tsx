import { useEffect, useState, useMemo } from 'react';
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
import { useRole } from '@/contexts/RoleContext';
import { portfolioApi } from '@/api/endpoints';
import { formatCurrency } from '@/lib/formatters';
import type { IntakeDetail } from '@/types/api';
import { ArrowLeft, Check, X, Undo2 } from 'lucide-react';

interface Props {
  projectId: string;
  onBack: () => void;
  onActionComplete: () => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'send-back';

export function IntakeDetailWorkspace({ projectId, onBack, onActionComplete }: Props) {
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

  // Collect unique months from resource plan for column headers
  const resourceMonths = useMemo(() => {
    if (!data?.resource_plan) return [];
    const months = new Set<string>();
    data.resource_plan.forEach((rp) => rp.months.forEach((m) => months.add(m.month)));
    return Array.from(months).sort();
  }, [data?.resource_plan]);

  const externalMonths = useMemo(() => {
    if (!data?.external_cost_plan) return [];
    const months = new Set<string>();
    data.external_cost_plan.forEach((ep) => ep.months.forEach((m) => months.add(m.month)));
    return Array.from(months).sort();
  }, [data?.external_cost_plan]);

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
    return <p className="text-sm text-slate-400">Project not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Intake Queue
      </Button>

      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-800">{data.name}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs capitalize">
            {data.status.replace(/_/g, ' ')}
          </Badge>
          <span className="text-sm text-slate-500">{data.lob_name}</span>
          {data.pl_name && <span className="text-sm text-slate-500">PL: {data.pl_name}</span>}
          <span className="text-sm text-slate-400">
            {data.start_month} — {data.end_month || 'Ongoing'}
          </span>
        </div>
        {data.description && (
          <p className="text-sm text-slate-600 mt-2">{data.description}</p>
        )}
      </div>

      <Separator />

      {/* Resource Plan Table */}
      {data.resource_plan && data.resource_plan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Resource Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-200 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs whitespace-nowrap">Role</TableHead>
                    {resourceMonths.map((m) => (
                      <TableHead key={m} className="px-3 py-2 text-xs text-right whitespace-nowrap">{m}</TableHead>
                    ))}
                    <TableHead className="px-3 py-2 text-xs text-right font-semibold whitespace-nowrap">Total Hours</TableHead>
                    <TableHead className="px-3 py-2 text-xs text-right font-semibold whitespace-nowrap">Total EUR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.resource_plan.map((rp) => (
                    <TableRow key={rp.role_id}>
                      <TableCell className="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">{rp.role_name}</TableCell>
                      {resourceMonths.map((m) => {
                        const md = rp.months.find((x) => x.month === m);
                        return (
                          <TableCell key={m} className="px-3 py-2 text-sm text-slate-600 text-right">
                            {md ? md.hours : '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-3 py-2 text-sm text-slate-700 text-right font-medium">{rp.total_hours}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-slate-700 text-right font-medium">{formatCurrency(rp.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* External Cost Plan */}
      {data.external_cost_plan && data.external_cost_plan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">External Cost Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-200 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-2 text-xs whitespace-nowrap">Cost Type</TableHead>
                    {externalMonths.map((m) => (
                      <TableHead key={m} className="px-3 py-2 text-xs text-right whitespace-nowrap">{m}</TableHead>
                    ))}
                    <TableHead className="px-3 py-2 text-xs text-right font-semibold whitespace-nowrap">Total EUR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.external_cost_plan.map((ep) => (
                    <TableRow key={ep.cost_type_id}>
                      <TableCell className="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">{ep.cost_type_name}</TableCell>
                      {externalMonths.map((m) => {
                        const md = ep.months.find((x) => x.month === m);
                        return (
                          <TableCell key={m} className="px-3 py-2 text-sm text-slate-600 text-right">
                            {md ? formatCurrency(md.amount) : '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-3 py-2 text-sm text-slate-700 text-right font-medium">{formatCurrency(ep.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Summary */}
      {data.budget_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Budget Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Internal Costs</p>
                <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.budget_summary.internal_total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">External Costs</p>
                <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.budget_summary.external_total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Grand Total</p>
                <p className="text-lg font-semibold text-slate-800">{formatCurrency(data.budget_summary.grand_total)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">CapEx / OpEx</p>
                <p className="text-lg font-semibold text-slate-800 capitalize">{data.budget_summary.capex_opex}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No plans message */}
      {(!data.resource_plan || data.resource_plan.length === 0) &&
       (!data.external_cost_plan || data.external_cost_plan.length === 0) && (
        <div className="rounded-md border border-slate-200 p-6 text-center text-sm text-slate-400">
          No resource or cost plan data submitted yet.
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {actionResult}
        </div>
      )}

      {/* Action Buttons (controller only) */}
      {isController && !actionResult && (
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
