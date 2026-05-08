/**
 * CapacityWorkspace — top-level component for `/capacity`.
 *
 * v5.2 W3 integration: replaces the W2 placeholder slots with the real
 * components shipped by Tracks A–D. The workspace tree is wrapped in
 * `<CapacitySidePanelProvider>` so the timeline + demand strip can open
 * `PersonDetail` / `CellDetail` without prop drilling. Layout (top to
 * bottom): ScopeBar → KPISummaryBar → FilterChipBar → CapacityTimeline +
 * DemandStrip → CapacityPanelContent (rendered by the side panel context).
 *
 * The dashboard layer card (§11) is intentionally absent — that's W4 S7.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §1.3, §2 layout.
 */
import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useRole } from '@/contexts/RoleContext';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
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
  for (const group of roleGroups) {
    for (const person of group.people) {
      const monthlyUtilization = Object.values(person.cells).map(
        (c) => c.utilization,
      );
      rows.push({
        person_id: person.personId,
        monthly_utilization: monthlyUtilization,
        has_pending_request: false,
        has_unassigned_months: false,
      });
    }
  }
  for (const person of flatPeople) {
    const monthlyUtilization = Object.values(person.cells).map(
      (c) => c.utilization,
    );
    rows.push({
      person_id: person.personId,
      monthly_utilization: monthlyUtilization,
      has_pending_request: false,
      has_unassigned_months: false,
    });
  }
  return rows;
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

      <CapacityTimeline onPersonClick={handlePersonClick} />

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
  const [searchParams] = useSearchParams();

  // Sync ScopeBar state with the URL query string. Called unconditionally
  // before the PL gate to keep hook ordering stable across renders.
  useScopeQueryParams();

  // Project Lead has no access to the workspace. Redirect during render
  // (not in an effect) so PL never sees a one-frame flash of the
  // workspace shell before the navigation fires.
  if (role === 'project_lead') {
    return <Navigate to="/capacity/availability" replace />;
  }

  // (W4 S6a) Deep-linked assignment opening will read this param and
  // hand it to AssignmentPanel. For W3 we just acknowledge it via a banner
  // so the redirect from `/capacity/project-assignment/:id` is observable.
  const assignmentProjectId = searchParams.get('assignment_project');

  return (
    <CapacitySidePanelProvider>
      {assignmentProjectId && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-xs text-muted-foreground">
            Assignment-panel deep link queued for project{' '}
            <span className="font-medium text-foreground">
              {assignmentProjectId}
            </span>{' '}
            — wiring lands in Wave 4 (S6a).
          </CardContent>
        </Card>
      )}

      <WorkspaceBody />
    </CapacitySidePanelProvider>
  );
}

export default CapacityWorkspace;
