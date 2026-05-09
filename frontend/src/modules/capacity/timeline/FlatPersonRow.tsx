/**
 * FlatPersonRow — v5.2 W3 Track A.
 *
 * Same visual model as `PersonTimelineRow` but used in the flat
 * group-by="Person" rendering path: rows are not nested under a role
 * group, no chevron, no indent. Sort order (peak utilization desc) is
 * applied by `useScopedTimelineData` before this component renders.
 *
 * Implementation note: this is a one-line wrapper around
 * `PersonTimelineRow` to keep the surface area explicit (the spec's
 * deliverable list calls for it as a distinct component, and a future
 * change to flat-row chrome — e.g., showing the role badge inline —
 * can land here without touching the role-group path).
 *
 * v5.2 W5 Track A (S6b): forwards the ghost overlay props through to
 * `PersonTimelineRow` so the assignment-mode ghost map is rendered
 * identically in either grouping mode.
 */
import {
  PersonTimelineRow,
  type PersonRowData,
} from './PersonTimelineRow';
import type { TimeColumn } from './timeAxis';
import type { GhostSegment } from './assignmentGhostOverlay';

interface FlatPersonRowProps {
  data: PersonRowData;
  columns: readonly TimeColumn[];
  onRowClick?: (personId: string) => void;
  ghostsByMonth?: Map<string, GhostSegment[]>;
  onGhostClick?: (ghost: GhostSegment, month: string) => void;
  onSessionClick?: (ghost: GhostSegment, month: string) => void;
}

export function FlatPersonRow({
  data,
  columns,
  onRowClick,
  ghostsByMonth,
  onGhostClick,
  onSessionClick,
}: FlatPersonRowProps) {
  return (
    <PersonTimelineRow
      data={data}
      columns={columns}
      onRowClick={onRowClick}
      indented={false}
      ghostsByMonth={ghostsByMonth}
      onGhostClick={onGhostClick}
      onSessionClick={onSessionClick}
    />
  );
}
