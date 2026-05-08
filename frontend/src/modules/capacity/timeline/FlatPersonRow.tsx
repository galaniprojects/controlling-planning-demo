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
 */
import {
  PersonTimelineRow,
  type PersonRowData,
} from './PersonTimelineRow';
import type { TimeColumn } from './timeAxis';

interface FlatPersonRowProps {
  data: PersonRowData;
  columns: readonly TimeColumn[];
  onRowClick?: (personId: string) => void;
}

export function FlatPersonRow({
  data,
  columns,
  onRowClick,
}: FlatPersonRowProps) {
  return (
    <PersonTimelineRow
      data={data}
      columns={columns}
      onRowClick={onRowClick}
      indented={false}
    />
  );
}
