/**
 * CapacityWorkspace — top-level component for `/capacity`.
 *
 * v5.2 W3 integration: replaces the W2 placeholder slots with the real
 * components shipped by Tracks A–D. The workspace tree is wrapped in
 * `<CapacitySidePanelProvider>` so the timeline + demand strip can open
 * `PersonDetail` / `CellDetail` without prop drilling. Layout (top to
 * bottom): ScopeBar → KPISummaryBar → DashboardLayer → FilterChipBar →
 * CapacityTimeline + DemandStrip. The side panel itself is rendered by
 * AppLayout from the shared SidePanelContext; openPerson / openCell pass
 * concrete content (PersonDetail / CellDetail) per call.
 *
 * v5.2 W4 Track A (Session 6a): URL-param assignment-panel entry point.
 *   - Reads `?assignment_project=`, `?cc=`, `?cr=` on mount.
 *   - Calls `enterAssignmentMode(...)` and registers `AssignmentPanel`
 *     as the `assignment` handler in `CapacitySidePanelContext`.
 *   - `AssignmentStateProvider` wraps the workspace so the side panel and
 *     the timeline overlay (S6b) share the same context instance.
 *
 * v5.2 W4 Track B (Session 7): DashboardLayer (§11) inserted between
 * KPISummaryBar and FilterChipBar. Self-contained — handles its own
 * visibility rules (Controller / Executive + multi-CC scope) and slide-up
 * animation, so no conditional rendering is needed at the parent level.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §1.3, §2 layout, §9.1, §11.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useRole } from '@/contexts/RoleContext';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { useSidePanel } from '@/contexts/SidePanelContext';
import { ScopeBar } from './ScopeBar';
import { useScopeQueryParams } from './hooks/useScopeQueryParams';
import { useScopedTimelineData } from './hooks/useScopedTimelineData';
import { CapacityTimeline } from './timeline';
import { KPISummaryBar } from './kpi/KPISummaryBar';
import { FilterChipBar } from './filters/FilterChipBar';
import { filterPeople, type TimelineRow } from './filters/filterPeople';
import { DemandStrip } from './demand/DemandStrip';
import {
  CapacitySidePanelProvider,
  useCapacitySidePanel,
} from './sidepanel/CapacitySidePanelContext';
import { useAssignmentState } from './assignment/AssignmentStateContext';
import { AssignmentPanel } from './assignment/AssignmentPanel';
import { DashboardLayer } from './dashboard';

/**
 * Build the loose `TimelineRow[]` array consumed by FilterChipBar
 * (badge counts) from the timeline hook's output. The `has_pending_*`
 * predicates aren't sourced by the heatmap endpoints in W3, so they
 * default to `false`; the inbox + role-availability surfaces would
 * supply richer signals in a follow-up.
 */
function buildFilterRows(
  roleGroups: ReturnType<typeof useScopedTimelineData>['roleGroups'],
  flatPeople: ReturnType<typeof useScopedTimelineData>['flatPeople'],
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const visit = (personId: string, cellsByMonth: Record<string, { utilization: number }> | undefined) => {
    const monthly = cellsByMonth
      ? Object.values(cellsByMonth).map((c) => c.utilization)
      : [];
    rows.push({
      person_id: personId,
      monthly_utilization: monthly,
      has_pending_request: false,
      has_unassigned_months: false,
    });
  };
  for (const group of roleGroups) {
    for (const person of group.people) visit(person.personId, person.cellsByMonth);
  }
  for (const person of flatPeople) visit(person.personId, person.cellsByMonth);
  return rows;
}

/**
 * AssignmentEntryPoint — v5.2 W4 Track A (Session 6a).
 *
 * Reads URL params `assignment_project`, `cc`, and optional `cr` on
 * mount and whenever they change.  When all required params are present,
 * calls `enterAssignmentMode(...)` and opens the assignment side panel.
 *
 * Also registers `AssignmentPanel` as the `assignment` handler in
 * `CapacitySidePanelContext` once on mount (unregisters on unmount).
 * The handler calls `openPanel(...)` from the shared `SidePanelContext`
 * directly, mirroring the pattern used by `openPerson` / `openCell` in
 * `CapacitySidePanelContext`.
 *
 * Renders nothing — purely a side-effect component.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.1 (URL-param entry),
 *       guides/Capacity_Module_Redesign_Implementation_Guide.md §S6a.
 */
function AssignmentEntryPoint() {
  const [searchParams] = useSearchParams();
  const { registerAssignmentHandler, openAssignment } = useCapacitySidePanel();
  const { openPanel, closePanel: closeSidePanel } = useSidePanel();
  const { enterAssignmentMode, session } = useAssignmentState();

  // Keep a ref to the latest openPanel / closeSidePanel so the registered
  // handler always invokes the current values even if they change (they
  // shouldn't — they're stable useCallbacks — but this is safer).
  const openPanelRef = useRef(openPanel);
  const closePanelRef = useRef(closeSidePanel);
  openPanelRef.current = openPanel;
  closePanelRef.current = closeSidePanel;

  // Register AssignmentPanel as the assignment handler — once on mount.
  useEffect(() => {
    const unregister = registerAssignmentHandler(
      (projectId: string, opts?: { ccId?: string; crId?: number }) => {
        openPanelRef.current(
          'Assign project',
          <AssignmentPanel
            projectId={projectId}
            ccId={opts?.ccId}
            crId={opts?.crId}
            onClose={closePanelRef.current}
          />,
          { width: 400 },
        );
      },
    );

    return unregister;
    // registerAssignmentHandler is stable — declared as useCallback([]) in context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAssignmentHandler]);

  // Read URL params and enter assignment mode when present.
  useEffect(() => {
    const projectId = searchParams.get('assignment_project');
    const ccId = searchParams.get('cc');
    const crParam = searchParams.get('cr');
    const crId = crParam ? parseInt(crParam, 10) : undefined;

    if (!projectId || !ccId) return;

    // Idempotency guard: `searchParams` identity changes whenever ANY
    // param changes — including ScopeBar interactions writing scope/cc/
    // group via useScopeQueryParams. Skip the re-entry when the active
    // session already matches; otherwise we'd wipe in-flight edits.
    // (AssignmentStateContext.enterAssignmentMode also short-circuits
    // for state correctness; this guard avoids the redundant openPanel
    // call and side-panel flicker.)
    if (
      session &&
      session.projectId === projectId &&
      session.ccId === ccId &&
      session.crId === crId
    ) {
      return;
    }

    enterAssignmentMode(projectId, ccId, crId, 'url_param');
    openAssignment(projectId, { ccId, crId });
  // `searchParams` object identity changes whenever any param changes.
  // `enterAssignmentMode` / `openAssignment` are stable useCallback refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session]);

  return null;
}

function WorkspaceBody() {
  const { groupBy, ccId, scope, activeFilters } = useCapacityScope();
  const { openPerson } = useCapacitySidePanel();

  // Hoisted timeline fetch so FilterChipBar can compute badge counts
  // off the same dataset the timeline renders.
  const data = useScopedTimelineData();

  const filterRows = useMemo(
    () => buildFilterRows(data.roleGroups, data.flatPeople),
    [data.roleGroups, data.flatPeople],
  );

  // Filter the rows here so the chip count UX matches reality, even
  // though CapacityTimeline does its own internal fetch in W3.
  const visibleFilteredCount = useMemo(
    () => filterPeople(filterRows, activeFilters).length,
    [filterRows, activeFilters],
  );

  const handlePersonClick = (personId: string) => {
    if (!ccId) return;
    openPerson(ccId, personId);
  };

  // The demand strip needs a CC context for the unfulfilled-RR list;
  // when the user is on All-CCs it stays an aggregate strip with no
  // side-panel hookup until W4 wires the cross-CC list.
  const demandClickEnabled = scope.kind !== 'all_ccs';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <ScopeBar />
        </CardContent>
      </Card>

      <KPISummaryBar />

      {/* Dashboard layer (§11): Controller / Executive + multi-CC scope only.
          DashboardLayer handles its own visibility and slide-up animation. */}
      <DashboardLayer />

      <FilterChipBar rows={filterRows} />

      {/* Hint when filters hide every row, so the empty timeline state
          isn't mistaken for a loading or scope problem. */}
      {!activeFilters.includes('all') && visibleFilteredCount === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-3 text-xs text-muted-foreground">
            No people match the active filter combination. Click "All" to
            reset.
          </CardContent>
        </Card>
      )}

      <CapacityTimeline data={data} onPersonClick={handlePersonClick} />

      {/* Demand strip is hidden in the project view per §10.7. */}
      {groupBy !== 'project' && (
        <DemandStrip
          onCellClick={
            demandClickEnabled
              ? (period) => {
                  // Track C didn't ship a demand-cell handler in W3; W4
                  // S6a wires this to a filtered unfulfilled-RR list.
                  // For now we no-op so the click is observable but
                  // doesn't open an empty panel.
                  void period;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

export function CapacityWorkspace() {
  const { context } = useRole();
  const role = context?.role;

  // Sync ScopeBar state with the URL query string. Called unconditionally
  // before the PL gate to keep hook ordering stable across renders.
  useScopeQueryParams();

  // Project Lead has no access to the workspace. Redirect during render
  // (not in an effect) so PL never sees a one-frame flash of the
  // workspace shell before the navigation fires.
  if (role === 'project_lead') {
    return <Navigate to="/capacity/availability" replace />;
  }

  return (
    // AssignmentStateProvider lives at App.tsx root level (alongside
    // SidePanelProvider) so AssignmentPanel rendered as SidePanel
    // content can read session state across the provider boundary.
    <CapacitySidePanelProvider>
      {/*
       * AssignmentEntryPoint registers the AssignmentPanel handler and
       * responds to ?assignment_project / ?cc / ?cr URL params.
       */}
      <AssignmentEntryPoint />
      <WorkspaceBody />
    </CapacitySidePanelProvider>
  );
}

export default CapacityWorkspace;
