/**
 * ProjectGroupView — v5.2 W5 Track B (spec §10).
 *
 * Composition root for the group-by-project timeline (mounted by
 * `CapacityTimeline.tsx` when `groupBy === 'project'`). The component
 * tree per spec §10.13:
 *
 *   ProjectGroupView
 *     ├── ProjectGroup × N           ← one row group per visible project
 *     │   ├── ProjectGroupRow        ← project header + fulfillment bar (§10.3)
 *     │   ├── AssignedPersonRow × P  ← dual-layer bar (§10.4)
 *     │   ├── UnassignedSlotRow × R  ← dashed demand ghost row (§10.5)
 *     │   └── ExternalCostRow × X    ← thin neutral cost timeline (§10.6)
 *     └── UnassignedSummary          ← sticky-bottom total unassigned hours (§10.7)
 *
 * Data sourcing options:
 *   - **Hoisted** (default in workspace): the parent calls
 *     `useCapacityProjectsData()` once and threads the result through
 *     `data` so `FilterChipBar` and the timeline share one fetch.
 *   - **Standalone**: omit `data` and the component falls back to its
 *     own internal fetch — handy for e2e tests / preview screens.
 *
 * Project summary side panel: clicks on the project header dispatch via
 * `useCapacitySidePanel().openProjectSummary(projectId)`. The handler is
 * registered in `CapacityWorkspace.tsx` (mirrors the W4 assignment-panel
 * registration pattern).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, FilterX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { useProjectColorMap } from '@/contexts/ProjectColorMapContext';
import { useCapacitySidePanel } from '../sidepanel/CapacitySidePanelContext';
import { useAssignmentState } from '../assignment/AssignmentStateContext';
import { useCapacityProjectsData, type CapacityProjectsState } from '../hooks/useCapacityProjectsData';
import { ProjectGroup } from './ProjectGroup';
import { UnassignedSummary } from './UnassignedSummary';
import { filterProjects } from './projectFilters';
import type { TimeColumn } from './timeAxis';
import type { CapacityProjectItem } from '@/types/api';

interface ProjectGroupViewProps {
  /** Visible time columns from `buildVisibleColumns(...)`. */
  columns: TimeColumn[];
  /**
   * Optional hoisted data — when provided, the component skips its
   * internal fetch. The workspace passes its hoisted snapshot here so
   * the chip bar and timeline render off the same fetch.
   */
  data?: CapacityProjectsState;
}

export function ProjectGroupView({ columns, data: providedData }: ProjectGroupViewProps) {
  const { activeFilters, ccId: scopeCcId } = useCapacityScope();
  const { registerVisibleProjects } = useProjectColorMap();
  const { openPerson, openProjectSummary, openAssignment } = useCapacitySidePanel();
  const { enterAssignmentMode } = useAssignmentState();

  // Standalone mode — fetch internally if no hoisted data was provided.
  const localData = useCapacityProjectsData(providedData === undefined);
  const data = providedData ?? localData;

  // Apply the active filter chip set client-side (mirrors backend semantics).
  const filteredItems = useMemo<CapacityProjectItem[]>(
    () => filterProjects(data.items, activeFilters),
    [data.items, activeFilters],
  );

  // Register newly-visible project ids with the color map so segments
  // and side-panel dots share stable colours across views.
  useEffect(() => {
    if (data.items.length > 0) {
      registerVisibleProjects(data.items.map((it) => it.project_id));
    }
  }, [data.items, registerVisibleProjects]);

  const handlePersonClick = (personId: string) => {
    if (!scopeCcId) {
      // CC-Owner default scope provides the ccId via context. For All-CCs
      // / location / hierarchy scopes we'd need to look up the person's
      // owning CC from the project payload — fall back to the project's
      // first assigned-person CC. The PersonDetail endpoint requires a
      // ccId for the URL path, so without one the click is a no-op
      // until the controller picks a CC via the My-CC dropdown.
      // (W6 follow-up could derive it server-side from person → CC.)
      const owningCc = data.items
        .flatMap((it) => it.assigned_people)
        .find((p) => p.person_id === personId)?.cost_center_id;
      if (!owningCc) return;
      openPerson(owningCc, personId);
      return;
    }
    openPerson(scopeCcId, personId);
  };

  const handleProjectClick = (projectId: string) => {
    openProjectSummary(projectId);
  };

  /**
   * Slot-click → assignment mode. The Lead's pre-work brief asked the
   * `UnassignedSlotRow.onSlotClick` prop to expose the entry point; we
   * implement it here by translating (projectId, requestId) → CC id from
   * the slot's `cc_id` field, then calling `enterAssignmentMode` +
   * `openAssignment`. The behaviour matches Track A's URL-param entry
   * point so both paths land on the same panel.
   */
  const handleSlotClick = (projectId: string, requestId: number) => {
    const project = data.items.find((it) => it.project_id === projectId);
    const slot = project?.unfulfilled_slots.find(
      (s) => s.request_id === requestId,
    );
    if (!slot) return;
    const crId = slot.change_request_id ?? undefined;
    enterAssignmentMode(projectId, slot.cc_id, crId, 'inbox');
    // The dispatcher routes to the AssignmentPanel handler registered
    // by `AssignmentEntryPoint`. Spec §10.5 requires the panel to be
    // pre-scrolled to the relevant role section — the AssignmentPanel
    // itself owns scroll behaviour; we just hand it the right context.
    openAssignment(projectId, { ccId: slot.cc_id, crId });
  };

  // ---- Render gates ----

  if (data.isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (data.error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load project view: {data.error}
        </CardContent>
      </Card>
    );
  }

  if (data.items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-0">
          <EmptyState
            icon={FolderOpen}
            title="No projects in this scope"
            description="Switch to a different scope or clear the active filters above."
          />
        </CardContent>
      </Card>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-0">
          <EmptyState
            icon={FilterX}
            title="No projects match the active filters"
            description='Click "All" in the filter bar to reset.'
          />
        </CardContent>
      </Card>
    );
  }

  // v5.2 W6 review fix (P2.5) — bump a `resetSignal` whenever the chip
  // set changes; ProjectGroup resets its local `expanded` state via
  // `useEffect([resetSignal])`. Pre-fix this used a React-key strategy
  // (`key={`${pid}::${filterKey}`}`) which forced full remounts of all
  // visible groups + their children on every chip toggle, defeating
  // `React.memo` and resetting timeline scroll position. The signal-
  // based approach achieves the same UX without the unmount/remount
  // cost.
  const filterKey = activeFilters.join(',') || 'all';
  const lastFilterKeyRef = useRef(filterKey);
  const [resetSignal, setResetSignal] = useState(0);
  useEffect(() => {
    if (lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey;
      setResetSignal((s) => s + 1);
    }
  }, [filterKey]);

  return (
    <>
      {filteredItems.map((item) => (
        <ProjectGroup
          key={item.project_id}
          item={item}
          columns={columns}
          referenceMaxHours={data.referenceMaxHours}
          resetSignal={resetSignal}
          onProjectClick={handleProjectClick}
          onPersonClick={handlePersonClick}
          onSlotClick={handleSlotClick}
        />
      ))}
      <UnassignedSummary items={filteredItems} columns={columns} />
    </>
  );
}

export default ProjectGroupView;
