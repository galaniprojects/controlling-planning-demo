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
    clearMonthAssignment,
    markSaved,
    exit,
    getRequestPayload,
    getDirtyRequestIds,
  } = useAssignmentState();

  const [detail, setDetail] = useState<ProjectAssignmentDetail | null>(null);
  const [teamPeople, setTeamPeople] = useState<
    RoleHeatmapRow[0]['people'] // PersonHeatmapRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch project detail + team heatmap in parallel
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      capacityApi.getProjectAssignmentDetail(projectId, crId),
      capacityApi.getTeamHeatmap(ccId),
    ])
      .then(([detailRes, heatmapRes]) => {
        if (cancelled) return;
        setDetail(detailRes);
        // Flatten all people from all role groups
        const people = heatmapRes.items.flatMap((row) => row.people);
        setTeamPeople(people);
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
    () => (detail?.requests ?? []).filter((r) => r.request_type === 'resource'),
    [detail],
  );

  const externalCostRequests = useMemo(
    () => (detail?.requests ?? []).filter((r) => r.request_type === 'external_cost'),
    [detail],
  );

  // -------------------------------------------------------------------------
  // Computed: total assigned / total months for progress bar
  // -------------------------------------------------------------------------

  const { totalMonths, assignedMonths } = useMemo(() => {
    if (!detail) return { totalMonths: 0, assignedMonths: 0 };
    let total = 0;
    let assigned = 0;
    resourceRequests.forEach((req) => {
      total += req.total_months;
      // Check context first, then API-reported count
      const localMap = session?.assignments.get(String(req.id));
      const localCount = localMap ? localMap.size : 0;
      const serverCount = req.assignment_count;
      assigned += Math.max(localCount, serverCount);
    });
    return { totalMonths: total, assignedMonths: assigned };
  }, [detail, resourceRequests, session]);

  const isFullyAssigned = totalMonths > 0 && assignedMonths >= totalMonths;

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
    (requestId: string, month: string, _personId: string) => {
      clearMonthAssignment(requestId, month);
    },
    [clearMonthAssignment],
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

            {/* Progress bar */}
            <AssignmentProgress
              assigned={assignedMonths}
              total={totalMonths}
            />

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
