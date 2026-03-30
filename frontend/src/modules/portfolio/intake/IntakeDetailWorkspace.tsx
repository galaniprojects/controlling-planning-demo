import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/shared/Skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DetailViewGrid } from '@/components/shared/DetailViewGrid';
import { DetailViewKPIStrip } from '@/components/shared/DetailViewKPIStrip';
import { useRole } from '@/contexts/RoleContext';
import { useActiveHierarchy } from '@/hooks/useActiveHierarchy';
import { portfolioApi } from '@/api/endpoints';
import type { IntakeDetail } from '@/types/api';
import { ArrowLeft, Check, X, Undo2, Edit2 } from 'lucide-react';
import { EditableIntakeGrid } from './EditableIntakeGrid';
import { IntakeDiffSection } from './IntakeDiffSection';

interface Props {
  projectId: string;
  onBack: () => void;
  onActionComplete: () => void;
}

type ActionMode = 'idle' | 'approve' | 'reject' | 'send-back' | 'resubmit' | 'edit-grid';

export function IntakeDetailWorkspace({ projectId, onBack, onActionComplete }: Props) {
  const { context } = useRole();
  const { topLevelLabel } = useActiveHierarchy();
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
      } else if (actionMode === 'resubmit') {
        await portfolioApi.resubmitIntake(projectId);
        setActionResult('Project resubmitted for approval.');
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
    return <p className="text-sm text-muted-foreground">Project not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Intake Queue
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{data.name}</span>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">{data.name}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={data.status} />
          {data.capex_opex && (
            <span className="text-xs text-muted-foreground uppercase">{data.capex_opex}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm max-w-lg">
          <div className="text-muted-foreground">Requesting {topLevelLabel}</div>
          <div className="text-foreground font-medium">{data.lob_name}</div>
          {data.pl_name && (
            <>
              <div className="text-muted-foreground">Project Lead</div>
              <div className="text-foreground">{data.pl_name}</div>
            </>
          )}
          <div className="text-muted-foreground">Proposed Timeline</div>
          <div className="text-foreground">
            {data.start_month} — {data.end_month || 'Ongoing'}
          </div>
        </div>
      </div>

      {/* Business Case / Justification */}
      {data.description && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Business Case</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{data.description}</p>
            </CardContent>
          </Card>
        </>
      )}

      <Separator />

      {/* Detail View Grid */}
      {data.grid_data && data.grid_data.line_items.length > 0 ? (
        <div className="space-y-4">
          <DetailViewGrid
            lineItems={data.grid_data.line_items}
            months={data.grid_data.months}
            cellPattern="intake"
          />
          <DetailViewKPIStrip kpis={data.grid_data.kpis} />
        </div>
      ) : (
        <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          No resource or cost plan data submitted yet.
        </div>
      )}

      {/* Resource Assignments (from CC Owner) */}
      {data.resource_plan && data.resource_plan.some((rp) => rp.assignments && rp.assignments.length > 0) && (
        <>
          <Separator />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Resource Assignments (CC Owner)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.resource_plan.filter((rp) => rp.assignments && rp.assignments.length > 0).map((rp) => {
                  // Group assignments by person
                  const personMap = new Map<string, { name: string; months: string[] }>();
                  for (const a of rp.assignments!) {
                    const existing = personMap.get(a.person_id);
                    if (existing) {
                      existing.months.push(a.month);
                    } else {
                      personMap.set(a.person_id, { name: a.person_name, months: [a.month] });
                    }
                  }
                  return (
                    <div key={rp.role_id} className="text-sm">
                      <p className="font-medium text-foreground">{rp.role_name}</p>
                      <div className="ml-3 mt-1 space-y-0.5">
                        {Array.from(personMap.entries()).map(([pid, info]) => (
                          <p key={pid} className="text-muted-foreground">
                            {info.name}
                            <span className="text-muted-foreground ml-1">
                              ({formatMonthRange(info.months)})
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Changes Requested — PL review with diff */}
      {data.status === 'changes_requested' && !isController && !actionResult && (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Changes Requested</p>
            {data.submission_feedback ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">{data.submission_feedback}</p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                The controller has reviewed your submission and requested changes. Review the comparison below.
              </p>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Proposed Changes</h3>
            <IntakeDiffSection projectId={projectId} onActionComplete={onActionComplete} />
          </div>
        </div>
      )}

      {/* Action Result */}
      {actionResult && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          {actionResult}
        </div>
      )}

      {/* Editable Grid (controller requesting changes) */}
      {actionMode === 'edit-grid' && (
        <EditableIntakeGrid
          projectId={projectId}
          onConfirm={async (comments, changes) => {
            await portfolioApi.sendBackIntake(projectId, comments, changes);
            setActionResult('Changes sent to Project Lead.');
            setActionMode('idle');
            onActionComplete();
          }}
          onCancel={() => setActionMode('idle')}
        />
      )}

      {/* Action Buttons (controller only) */}
      {isController && !actionResult && data.status === 'pending_approval' && actionMode !== 'edit-grid' && (
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
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
                <p className="text-xs font-medium text-muted-foreground">
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

function formatMonthRange(months: string[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort();
  if (sorted.length === 1) return formatMonth(sorted[0]);

  // Check if contiguous
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return `${formatMonth(first)} -- ${formatMonth(last)}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}
