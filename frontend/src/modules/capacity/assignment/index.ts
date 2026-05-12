/**
 * Assignment module barrel export — v5.2 W4 Track A (Session 6a).
 *
 * Exports the `AssignmentState` context types and hook so W5 Session 6b
 * (timeline ghost overlay) can consume them without reaching into the
 * internal file tree.
 *
 * Spec: guides/Capacity_Module_Redesign_Implementation_Guide.md §S6a
 *   "Export the type from a barrel index.ts so W5 S6b can consume it
 *    for the timeline overlay."
 */

// Context, types, provider, and hook
export {
  AssignmentStateProvider,
  useAssignmentState,
} from './AssignmentStateContext';

export type {
  AssignmentSession,
  AssignmentMap,
  AssignmentEntrySource,
  MonthPersonAssignment,
  AssignmentStateActions,
  DraftKey,
} from './AssignmentStateContext';

// Panel — registered via registerAssignmentHandler in CapacityWorkspace
export { AssignmentPanel } from './AssignmentPanel';
