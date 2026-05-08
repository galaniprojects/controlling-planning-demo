/**
 * Public surface of the v5.2 W3 Track A timeline.
 *
 * Lead integration into `CapacityWorkspace.tsx` happens after Track A
 * lands; everything other consumers (S5a side panel, S7 dashboard,
 * etc.) need from this directory is re-exported here.
 */
export { CapacityTimeline } from './CapacityTimeline';
export type { CapacityTimelineProps } from './CapacityTimeline';

export { TimeAxisHeader } from './TimeAxisHeader';
export { PersonTimelineRow } from './PersonTimelineRow';
export type { PersonRowData } from './PersonTimelineRow';
export { FlatPersonRow } from './FlatPersonRow';
export { RoleGroup } from './RoleGroup';
export type { RoleGroupData } from './RoleGroup';
export { SegmentBar } from './SegmentBar';
export type { SegmentBarProps, BarSegment } from './SegmentBar';
export {
  type Quarter,
  type TimeColumn,
  type TimeAxisState,
  type MonthCell,
  type PeriodSummary,
  defaultTimeAxisState,
  buildVisibleColumns,
  computePeriodSummary,
  generateMonthRange,
  toggleYear,
  toggleQuarter,
  shortMonthLabel,
  quarterLabel,
  NAME_COLUMN_WIDTH,
  MONTH_COLUMN_WIDTH,
  QUARTER_COLUMN_WIDTH,
  YEAR_COLUMN_WIDTH,
} from './timeAxis';
