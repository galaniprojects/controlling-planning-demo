import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/shared/Skeleton';
import { capacityApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import { AssignmentGrid, type PersonOption, type RequestGridData } from './AssignmentGrid';
import type {
  ProjectAssignmentDetail,
  RoleHeatmapRow,
  PersonHeatmapRow,
} from '@/types/api';
import { FileText } from 'lucide-react';

export function ProjectAssignmentPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const crId = searchParams.get('cr') ? Number(searchParams.get('cr')) : undefined;

  const [detail, setDetail] = useState<ProjectAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<RoleHeatmapRow[]>([]);
  const [heatmapExpanded, setHeatmapExpanded] = useState(false);

  // Grid data: per-request monthly hours + assignments
  const [gridData, setGridData] = useState<Map<number, RequestGridData>>(new Map());
  const [gridLoading, setGridLoading] = useState(false);

  // Decline state
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchDetail = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    capacityApi
      .getProjectAssignmentDetail(projectId, crId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [projectId, crId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Fetch grid data (monthly hours + assignments) for all resource requests
  useEffect(() => {
    if (!detail || !detail.cost_center_id) return;

    const resourceRequests = detail.requests.filter((r) => r.request_type === 'resource');
    if (resourceRequests.length === 0) return;

    const ccId = detail.cost_center_id;
    setGridLoading(true);

    Promise.all([
      Promise.all(resourceRequests.map((r) => capacityApi.getRequestMonthlyHours(ccId, r.id))),
      Promise.all(resourceRequests.map((r) => capacityApi.getRequestAssignments(ccId, r.id))),
    ])
      .then(([hoursResults, assignResults]) => {
        const newMap = new Map<number, RequestGridData>();
        resourceRequests.forEach((req, i) => {
          const assignMap: Record<string, string> = {};
          for (const a of assignResults[i].items) {
            assignMap[a.month] = a.person_id;
          }
          newMap.set(req.id, {
            hours: hoursResults[i].items,
            assignments: assignMap,
          });
        });
        setGridData(newMap);
      })
      .catch(() => setGridData(new Map()))
      .finally(() => setGridLoading(false));
  }, [detail]);

  // Fetch team heatmap for the CC owner's cost center
  useEffect(() => {
    if (!detail || !detail.cost_center_id) return;

    const starts = detail.requests.map((r) => r.period_start);
    const ends = detail.requests.map((r) => r.period_end);
    const minMonth = starts.sort()[0];
    const maxMonth = ends.sort().reverse()[0];

    capacityApi
      .getTeamHeatmap(detail.cost_center_id, minMonth, maxMonth)
      .then((res) => setHeatmapData(res.items))
      .catch(() => setHeatmapData([]));
  }, [detail]);

  // Build available people from heatmap
  const availablePeople: PersonOption[] = useMemo(() => {
    return heatmapData.flatMap((role) =>
      role.people.map((p: PersonHeatmapRow) => ({
        person_id: p.person_id,
        name: p.name,
        roleName: role.role_name,
        utilizationByMonth: Object.fromEntries(
          p.utilization.map((u) => [u.month, u.value]),
        ),
      })),
    );
  }, [heatmapData]);

  // Compute allMonths as the sorted union across all resource requests' hours
  const allMonths = useMemo(() => {
    const monthSet = new Set<string>();
    for (const [, data] of gridData) {
      for (const h of data.hours) {
        monthSet.add(h.month);
      }
    }
    return [...monthSet].sort();
  }, [gridData]);

  // Optimistic grid data update (before API call completes)
  const handleGridDataChange = useCallback((reqId: number, month: string, personId: string) => {
    setGridData((prev) => {
      const next = new Map(prev);
      const reqData = next.get(reqId);
      if (reqData) {
        next.set(reqId, {
          ...reqData,
          assignments: { ...reqData.assignments, [month]: personId },
        });
      }
      return next;
    });
  }, []);

  // Optimistic bulk update: assign one person to all months of a request
  const handleGridDataBulkChange = useCallback((reqId: number, months: string[], personId: string) => {
    setGridData((prev) => {
      const next = new Map(prev);
      const reqData = next.get(reqId);
      if (reqData) {
        const newAssignments = { ...reqData.assignments };
        for (const m of months) {
          newAssignments[m] = personId;
        }
        next.set(reqId, { ...reqData, assignments: newAssignments });
      }
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    if (!projectId) return;
    setConfirming(true);
    setResult(null);
    try {
      const res = await capacityApi.confirmProject(projectId);
      setResult({ type: 'success', message: `"${res.name}" confirmed -- sent to intake queue.` });
      setTimeout(() => navigate('/capacity'), 2000);
    } catch {
      setResult({ type: 'error', message: 'Confirmation failed. Please try again.' });
    } finally {
      setConfirming(false);
    }
  };

  const handleDecline = async () => {
    if (!projectId || !declineReason.trim()) return;
    setConfirming(true);
    setResult(null);
    try {
      const res = await capacityApi.declineProject(projectId, declineReason.trim());
      setResult({ type: 'success', message: `"${res.name}" declined -- sent back to PL.` });
      setTimeout(() => navigate('/capacity'), 2000);
    } catch {
      setResult({ type: 'error', message: 'Decline failed. Please try again.' });
    } finally {
      setConfirming(false);
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground">Project not found.</p>;
  }

  const { project, all_resource_requests_assigned } = detail;
  const resourceRequests = detail.requests.filter((r) => r.request_type === 'resource');

  return (
    <div className="space-y-4">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/capacity')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Capacity Management
      </button>

      {/* Project header */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>{project.lob_name}</span>
                {project.pl_name && <span>PL: {project.pl_name}</span>}
                <span>
                  {project.start_month} -- {project.end_month || 'Ongoing'}
                </span>
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{project.description}</p>
              )}
            </div>
            <Badge
              className={cn(
                all_resource_requests_assigned
                  ? 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/40'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/40',
              )}
            >
              {all_resource_requests_assigned ? 'All Assigned' : 'Pending Assignment'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* CR context banner */}
      {detail.change_request && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-foreground">
              Change Request #{detail.change_request.id}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            {detail.change_request.summary}
          </p>
        </div>
      )}

      {/* Re-confirmation banner (shown when project was resubmitted with changes) */}
      {resourceRequests.some((r) => r.change_direction) && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
          <p className="font-medium text-foreground">Re-confirmation Required</p>
          <p className="text-muted-foreground mt-1">
            This project was resubmitted with changes. Previous assignments are preserved.
            Cells with changes are highlighted -- please review and confirm.
          </p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded ring-2 ring-blue-300 bg-blue-100 dark:ring-blue-700 dark:bg-blue-900/30" />
              Hours increased
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded ring-2 ring-orange-300 bg-orange-100 dark:ring-orange-700 dark:bg-orange-900/30" />
              Hours decreased
            </span>
          </div>
        </div>
      )}

      {/* Assignment Grid */}
      {gridLoading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : (
        <AssignmentGrid
          ccId={detail.cost_center_id ?? ''}
          requests={resourceRequests}
          gridData={gridData}
          availablePeople={availablePeople}
          allMonths={allMonths}
          onAssignmentSaved={fetchDetail}
          onGridDataChange={handleGridDataChange}
          onGridDataBulkChange={handleGridDataBulkChange}
        />
      )}

      {/* Team Availability Reference */}
      {availablePeople.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setHeatmapExpanded((e) => !e)}
          >
            <span className="text-sm font-medium text-foreground">
              Team Availability ({availablePeople.length} members)
            </span>
            {heatmapExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {heatmapExpanded && (
            <div className="px-4 pb-4">
              <TeamHeatmapTable data={heatmapData} />
            </div>
          )}
        </div>
      )}

      {/* Result message */}
      {result && (
        <div
          className={cn(
            'rounded border p-3 text-sm',
            result.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {result.message}
        </div>
      )}

      {/* Decline textarea */}
      {declining && !result && (
        <div className="space-y-2">
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason for declining resources..."
            rows={2}
            className="text-sm"
          />
        </div>
      )}

      {/* Actions */}
      {!result && project.status === 'pending_cc_confirmation' && (
        <div className="flex gap-2 pt-2 border-t border-border">
          {declining ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDecline}
                disabled={!declineReason.trim() || confirming}
              >
                {confirming ? 'Declining...' : 'Confirm Decline'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDeclining(false);
                  setDeclineReason('');
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!all_resource_requests_assigned || confirming}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                {confirming ? 'Confirming...' : 'Confirm All & Send to Controller'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeclining(true)}
                className="text-red-600 hover:text-red-700"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Decline
              </Button>
              {!all_resource_requests_assigned && (
                <span className="text-xs text-amber-600 dark:text-amber-400 self-center ml-2">
                  Assign all resource requests before confirming
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Team Heatmap Reference Table ---- */

function TeamHeatmapTable({ data }: { data: RoleHeatmapRow[] }) {
  const allPeople = data.flatMap((role) =>
    role.people.map((p) => ({ ...p, roleName: role.role_name })),
  );

  if (allPeople.length === 0) return null;

  const months = allPeople[0]?.utilization.map((u) => u.month) ?? [];

  return (
    <div className="rounded-md border border-border overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Person</th>
            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Role</th>
            {months.map((m) => (
              <th key={m} className="px-1 py-1.5 text-center text-muted-foreground font-medium">
                {m.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPeople.map((person) => (
            <tr key={person.person_id} className="border-b border-border/50">
              <td className="px-2 py-1.5 font-medium text-foreground">{person.name}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{person.roleName}</td>
              {person.utilization.map((cell) => {
                const bgMap: Record<string, string> = {
                  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                };
                return (
                  <td key={cell.month} className="px-1 py-1.5 text-center">
                    <span className={cn('rounded px-1 py-0.5 text-xs', bgMap[cell.color])}>
                      {cell.value.toFixed(0)}%
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
