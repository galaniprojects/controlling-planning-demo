/**
 * ProjectGroup — v5.2 W5 Track B (spec §10.2 / §10.13).
 *
 * Container for one project's row tree:
 *
 *   ProjectGroupRow                 ← project header + fulfillment bar
 *     └── (when expanded)
 *         AssignedPersonRow × N     ← people allocated to the project
 *         UnassignedSlotRow × M     ← pending RR rows (demand ghosts)
 *         ExternalCostRow × K       ← external-cost RR rows
 *
 * Sort order within a group (per §10.2):
 *   1. Assigned person rows, hours desc (already pre-sorted by API).
 *   2. Unassigned request slot rows, period_start asc (API pre-sorts).
 *   3. External cost rows last.
 *
 * Local `expanded` state defaults to `true`. Collapsing hides all child
 * rows; the project header itself stays visible.
 *
 * v5.2 W6 Track C — wrapped in `React.memo` so the row tree only
 * re-renders when its props identity changes (e.g., the parent fetches
 * new data, the time-axis columns change, or one of the click callbacks
 * changes). With ~15-30 projects in a typical multi-CC scope and ~10
 * children each, skipping re-renders on filter-chip toggles keeps
 * project-view interactions snappy.
 *
 * v5.2 W6 Track C — `defaultExpanded` is read on first mount only. The
 * parent (`ProjectGroupView`) resets expanded state across the whole
 * tree by including `activeFilters` in each `<ProjectGroup>`'s `key`,
 * forcing a remount when the filter set changes. That keeps the local
 * collapse state honest without an extra effect that would also reset
 * on every parent re-render.
 */
import { memo, useState } from 'react';
import { type TimeColumn } from './timeAxis';
import { ProjectGroupRow } from './ProjectGroupRow';
import { AssignedPersonRow } from './AssignedPersonRow';
import { UnassignedSlotRow } from './UnassignedSlotRow';
import { ExternalCostRow } from './ExternalCostRow';
import type { CapacityProjectItem } from '@/types/api';

export interface ProjectGroupProps {
  item: CapacityProjectItem;
  columns: readonly TimeColumn[];
  /** Reference maximum hours across visible projects (width scaling). */
  referenceMaxHours: number;
  /** Default expanded state. */
  defaultExpanded?: boolean;
  /** Click-on-project-header → side-panel project summary (§10.8). */
  onProjectClick?: (projectId: string) => void;
  /** Click-on-person → side-panel person detail (§7.2). */
  onPersonClick?: (personId: string) => void;
  /**
   * Click-on-unassigned-slot → assignment panel (§10.5).
   * Lead wires this to `enterAssignmentMode` post-merge.
   */
  onSlotClick?: (projectId: string, requestId: number) => void;
}

function ProjectGroupImpl({
  item,
  columns,
  referenceMaxHours,
  defaultExpanded = true,
  onProjectClick,
  onPersonClick,
  onSlotClick,
}: ProjectGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div role="rowgroup">
      <ProjectGroupRow
        item={item}
        columns={columns}
        referenceMaxHours={referenceMaxHours}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        onRowClick={onProjectClick}
      />

      {expanded && (
        <>
          {item.assigned_people.map((person) => (
            <AssignedPersonRow
              key={`person-${person.person_id}`}
              person={person}
              projectId={item.project_id}
              projectName={item.project_name}
              columns={columns}
              onPersonClick={onPersonClick}
            />
          ))}
          {item.unfulfilled_slots.map((slot) => (
            <UnassignedSlotRow
              key={`slot-${slot.request_id}`}
              slot={slot}
              projectId={item.project_id}
              columns={columns}
              referenceMaxHours={referenceMaxHours}
              onSlotClick={onSlotClick}
            />
          ))}
          {item.external_costs.map((cost) => (
            <ExternalCostRow
              key={`cost-${cost.request_id}`}
              cost={cost}
              columns={columns}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Memo wrapper — the default referential-equality check works because
 * the parent passes stable callbacks (or memoised closures) and the
 * `item` / `columns` references only change when the underlying data
 * fetch returns a fresh snapshot.
 */
export const ProjectGroup = memo(ProjectGroupImpl);
