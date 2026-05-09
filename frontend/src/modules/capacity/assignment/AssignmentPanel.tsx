/**
 * AssignmentPanel — v5.2 W4 Track A (Session 6a).
 *
 * Project-level CC Owner assignment surface. Renders inside the 400px
 * `DetailSidePanel` when assignment mode is active (registered via
 * `registerAssignmentHandler`).
 *
 * Structure (top to bottom):
 *   ProjectHeader   — name, meta, status, optional CRBanner
 *   AssignmentProgress — progress bar + "14 of 19 months assigned"
 *   RoleSection × N — one per resource request (request_type='resource')
 *   ExternalCostSection — cost requests (request_type='external_cost')
 *   AssignmentActionBar — Save draft / Confirm / Decline (sticky)
 *
 * Unsaved-changes Dialog fires when the user tries to close while dirty.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2, §9.7, §9.11
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { capacityApi } from '@/api/endpoints';
import type { ProjectAssignmentDetail, RoleHeatmapRow } from '@/types/api';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { useAssignmentState } from './AssignmentStateContext';
import { ProjectHeader } from './ProjectHeader';
import { AssignmentProgress } from './AssignmentProgress';
import { RoleSection } from './RoleSection';
import { ExternalCostSection } from './ExternalCostSection';
import { AssignmentActionBar } from './AssignmentActionBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssignmentPanelInnerProps {
  projectId: string;
  ccId: string;
  crId?: number;
  onRequestClose: () => void;
}

// ---------------------------------------------------------------------------
// Inner component (data-fetching layer)
// ---------------------------------------------------------------------------

function AssignmentPanelInner({
  projectId,
  ccId,
  crId,
  onRequestClose,
}: AssignmentPanelInnerProps) {
  const {
    session,
    setMonthAssignment,
    addPersonToMonth,
    removePersonFromMonth,
    clearMonthAssignment,
    markSaved,
    exit,
    getRequestPayload,
    getDirtyRequestIds,
  } = useAssignmentState();
  const { registerBeforeClose } = useSidePanel();

  const [detail, setDetail] = useState<ProjectAssignmentDetail | null>(null);
  const [teamPeople, setTeamPeople] = useState<
    RoleHeatmapRow[0]['people'] // PersonHeatmapRow[]
  >([]);
  /** IDs of requests that belong to this specific CC (used to filter cross-CC projects). */
  const [ccRequestIds, setCcRequestIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // -------------------------------------------------------------------------
  // Register before-close guard to show unsaved-changes dialog when dirty.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const unregister = registerBeforeClose(() => {
      if (session?.dirty) {
        setShowUnsavedDialog(true);
        return false; // cancel the close
      }
      return undefined; // allow close
    });
    return unregister;
  // Re-register when dirty state changes so the guard always reflects
  // the current dirty flag.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.dirty, registerBeforeClose]);

  // -------------------------------------------------------------------------
  // Fetch project detail + team heatmap + CC requests in parallel.
  // The CC requests list lets us filter cross-CC projects so only requests
  // scoped to THIS cc appear in the panel (prevents 404s on monthly-hours
  // and assignment endpoints which are CC-scoped).
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      capacityApi.getProjectAssignmentDetail(projectId, crId),
      capacityApi.getTeamHeatmap(ccId),
      capacityApi.getRequests(ccId),
    ])
      .then(([detailRes, heatmapRes, ccRequestsRes]) => {
        if (cancelled) return;
        setDetail(detailRes);
        // Flatten all people from all role groups
        const people = heatmapRes.items.flatMap((row) => row.people);
        setTeamPeople(people);
        // Build a set of request IDs belonging to this CC
        setCcRequestIds(new Set(ccRequestsRes.items.map((r) => r.id)));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assignment data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId, ccId, crId]);

  // -------------------------------------------------------------------------
  // Computed: resource vs. external cost requests
  // -------------------------------------------------------------------------

  const resourceRequests = useMemo(
    () =>
      (detail?.requests ?? []).filter(
        (r) => r.request_type === 'resource' && ccRequestIds.has(r.id),
      ),
    [detail, ccRequestIds],
  );

  const externalCostRequests = useMemo(
    () =>
      (detail?.requests ?? []).filter(
        (r) => r.request_type === 'external_cost' && ccRequestIds.has(r.id),
      ),
    [detail, ccRequestIds],
  );

  // -------------------------------------------------------------------------
  // Computed: total assigned / total months for progress bar
  // -------------------------------------------------------------------------

  const { totalMonths, assignedMonths, partialMonths } = useMemo(() => {
    if (!detail) return { totalMonths: 0, assignedMonths: 0, partialMonths: 0 };
    let total = 0;
    let assigned = 0;
    let partial = 0;
    resourceRequests.forEach((req) => {
      total += req.total_months;
      // Per-month evaluation: when local context has an entry for the
      // month, use that (it reflects in-flight edits). Otherwise fall back
      // to the server-reported assignment_count (W4 single-person heuristic).
      const localMap = session?.assignments.get(String(req.id));
      if (localMap && localMap.size > 0) {
        let localAssigned = 0;
        let localPartial = 0;
        const requestHours = Number(req.hours_or_amount) || 0;
        localMap.forEach((people) => {
          const sum = people.reduce((acc, p) => acc + p.hours, 0);
          if (sum > 0) {
            localAssigned += 1;
            if (requestHours > 0 && sum < requestHours) localPartial += 1;
          }
        });
        // The local map only includes touched months — server-reported
        // assignment_count covers untouched months for the same request.
        // Use the larger of the two so we don't double-count but also
        // don't lose server state.
        assigned += Math.max(localAssigned, req.assignment_count);
        partial += localPartial;
      } else {
        assigned += req.assignment_count;
      }
    });
    return { totalMonths: total, assignedMonths: assigned, partialMonths: partial };
  }, [detail, resourceRequests, session]);

  const isFullyAssigned =
    totalMonths > 0 && assignedMonths >= totalMonths && partialMonths === 0;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleAssign = useCallback(
    (requestId: string, month: string, personId: string, hours: number) => {
      setMonthAssignment(requestId, month, personId, hours);
    },
    [setMonthAssignment],
  );

  const handleRemove = useCallback(
    (requestId: string, month: string, personId: string) => {
      // Single-person months: removing the only chip clears the month.
      // Multi-person months: removing one chip leaves the remaining people
      // intact (handled by removePersonFromMonth + the empty-list guard).
      const reqMap = session?.assignments.get(requestId);
      const list = reqMap?.get(month) ?? [];
      if (list.length <= 1) {
        clearMonthAssignment(requestId, month);
      } else {
        removePersonFromMonth(requestId, month, personId);
      }
    },
    [clearMonthAssignment, removePersonFromMonth, session],
  );

  const handleAddPerson = useCallback(
    (
      requestId: string,
      month: string,
      personId: string,
      hours: number,
      rebalanceAmount: number,
    ) => {
      addPersonToMonth(requestId, month, personId, hours, rebalanceAmount);
    },
    [addPersonToMonth],
  );

  // Save draft — calls saveRequestAssignments for each dirty request
  const handleSaveDraft = useCallback(async () => {
    const dirtyIds = getDirtyRequestIds();
    await Promise.all(
      dirtyIds.map(async (reqId) => {
        const payload = getRequestPayload(reqId);
        if (payload.length === 0) return;
        await capacityApi.saveRequestAssignments(
          ccId,
          parseInt(reqId, 10),
          payload,
        );
      }),
    );
    markSaved();
  }, [ccId, getDirtyRequestIds, getRequestPayload, markSaved]);

  // Close with unsaved-changes guard
  const handleRequestClose = useCallback(() => {
    if (session?.dirty) {
      setShowUnsavedDialog(true);
    } else {
      exit();
      onRequestClose();
    }
  }, [session?.dirty, exit, onRequestClose]);

  const handleSaveDraftAndClose = useCallback(async () => {
    await handleSaveDraft();
    exit();
    onRequestClose();
    setShowUnsavedDialog(false);
  }, [handleSaveDraft, exit, onRequestClose]);

  const handleDiscard = useCallback(() => {
    exit();
    onRequestClose();
    setShowUnsavedDialog(false);
  }, [exit, onRequestClose]);

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">{error ?? 'No data found.'}</p>
        <Button variant="outline" size="sm" onClick={onRequestClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Unsaved changes dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsaved assignments</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have unsaved assignment changes. What would you like to do?
          </p>
          <DialogFooter className="flex-col gap-1.5 sm:flex-col">
            <Button className="w-full" onClick={handleSaveDraftAndClose}>
              Save draft
            </Button>
            <Button variant="outline" className="w-full" onClick={handleDiscard}>
              Discard changes
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowUnsavedDialog(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel content */}
      <div className="flex h-full flex-col">
        {/* Scrollable main content */}
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {/* Project header */}
            <ProjectHeader data={detail} />

            {/* Progress bar — assigned + partial counts per §9.5. */}
            <AssignmentProgress
              assigned={assignedMonths}
              total={totalMonths}
              partial={partialMonths}
            />

            {/* Empty state — project has requests but none on this CC.
                Common for cross-CC projects: nav landed on cc-foo but the
                requests live on cc-bar. Tell the user where to go. */}
            {resourceRequests.length === 0 &&
              externalCostRequests.length === 0 &&
              (detail.requests ?? []).length > 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">
                    No resource requests for this project on the current cost centre.
                  </p>
                  <p>
                    This project has {detail.requests.length} request
                    {detail.requests.length === 1 ? '' : 's'} on other cost
                    centre{detail.requests.length === 1 ? '' : 's'}. Open
                    the Requests inbox and pick the matching CC row to
                    assign there.
                  </p>
                </div>
              )}

            {/* Resource role sections */}
            {resourceRequests.length > 0 && (
              <div className="space-y-0">
                {resourceRequests.map((req, idx) => (
                  <div key={req.id}>
                    {idx > 0 && <Separator className="my-2" />}
                    <RoleSection
                      ccId={ccId}
                      request={req}
                      teamPeople={teamPeople}
                      assignedMap={
                        session?.assignments.get(String(req.id)) ??
                        new Map()
                      }
                      onAssign={handleAssign}
                      onRemove={handleRemove}
                      onAddPerson={handleAddPerson}
                      projectedUtils={new Map()}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* External cost section */}
            {externalCostRequests.length > 0 && (
              <>
                <Separator />
                <ExternalCostSection ccId={ccId} requests={externalCostRequests} />
              </>
            )}
          </div>
        </ScrollArea>

        {/* Sticky action bar */}
        <div className="border-t border-border bg-card p-3">
          <AssignmentActionBar
            projectId={projectId}
            ccId={ccId}
            projectName={detail.project.name}
            isFullyAssigned={isFullyAssigned}
            isDirty={session?.dirty ?? false}
            onSaveDraft={handleSaveDraft}
            onConfirmed={() => {
              exit();
              onRequestClose();
            }}
            onDeclined={() => {
              exit();
              onRequestClose();
            }}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public AssignmentPanel — registered via registerAssignmentHandler
// ---------------------------------------------------------------------------

/**
 * AssignmentPanel is the handler registered with `CapacitySidePanelContext`.
 * It reads the active session from `AssignmentStateContext` to know which
 * project to display.
 *
 * The `CapacitySidePanelContext` calls the registered handler with
 * (projectId, { ccId?, crId? }) — the panel extracts these from props.
 */

interface AssignmentPanelProps {
  projectId: string;
  ccId?: string;
  crId?: number;
  onClose: () => void;
}

export function AssignmentPanel({
  projectId,
  ccId,
  crId,
  onClose,
}: AssignmentPanelProps) {
  const { session } = useAssignmentState();

  // Use props first, fall back to session state
  const effectiveCcId = ccId ?? session?.ccId ?? '';

  if (!effectiveCcId) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          No cost-centre context available. Please navigate from the workspace.
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <AssignmentPanelInner
      projectId={projectId}
      ccId={effectiveCcId}
      crId={crId ?? session?.crId}
      onRequestClose={onClose}
    />
  );
}
