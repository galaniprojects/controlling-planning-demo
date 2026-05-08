/**
 * AssignmentStateContext — v5.2 W4 Track A (Session 6a).
 *
 * Single source of truth for an in-flight assignment session inside
 * the Capacity workspace.  The context is consumed by:
 *
 *   - `AssignmentPanel.tsx` (side-panel form — this session)
 *   - Timeline ghost overlay (Session 6b — reads state, does not write)
 *
 * Lifecycle:
 *   1. CC Owner opens assignment mode → `enterAssignmentMode(...)`.
 *   2. User selects people month-by-month → `setMonthAssignment(...)`.
 *   3. User either:
 *        a. Saves draft via `saveDraft()` (persists without allocations).
 *        b. Confirms via `confirm()` (creates Allocation rows).
 *        c. Declines via `decline(reason)`.
 *        d. Exits without saving via `exit()` (clears state).
 *
 * Dirty flag is set on any `setMonthAssignment` / `clearMonthAssignment`
 * call and cleared on save / confirm / decline / exit.
 *
 * State persists across panel close/reopen within the same workspace
 * session (i.e. the context lives above the panel).
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.7
 * Impl guide: Session 6a deliverable 1.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Type definitions — exported so W5 S6b can consume them
// ---------------------------------------------------------------------------

/** Months that have already been saved (draft-persisted) but not confirmed. */
export type DraftKey = `${string}:${string}`; // `${requestId}:${month}`

/** A single person → hours mapping within a month. */
export interface MonthPersonAssignment {
  personId: string;
  hours: number;
}

/**
 * The raw per-request assignment map stored in context.
 *
 * Outer key: `requestId` (string-coerced number)
 * Inner key: `month` (ISO `YYYY-MM`)
 * Value: array of person assignments (single-element for W4; multi-person in W5 S10)
 */
export type AssignmentMap = Map<string, Map<string, MonthPersonAssignment[]>>;

/** Where the assignment session was initiated from. */
export type AssignmentEntrySource = 'url_param' | 'person_detail' | 'demand_strip' | 'inbox';

export interface AssignmentSession {
  /** Project whose resource requests are being assigned. */
  projectId: string;
  /** Cost-centre scope for API calls. */
  ccId: string;
  /** Optional CR driving a re-confirmation flow. */
  crId?: number;
  /** Where the session was opened from. */
  entrySource: AssignmentEntrySource;
  /** Per-request per-month person assignments (unsaved local state). */
  assignments: AssignmentMap;
  /** True when there are unsaved local changes. */
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Context public interface
// ---------------------------------------------------------------------------

export interface AssignmentStateActions {
  /** The active assignment session, or null when no session is open. */
  session: AssignmentSession | null;

  /**
   * Enter assignment mode for a project.  Clears any previous session.
   */
  enterAssignmentMode: (
    projectId: string,
    ccId: string,
    crId?: number,
    entrySource?: AssignmentEntrySource,
  ) => void;

  /**
   * Record a person assignment for a specific request + month.
   * Replaces any existing assignment for that request + month (single-person
   * flow for W4; multi-person extend is W5 S10).
   */
  setMonthAssignment: (
    requestId: string,
    month: string,
    personId: string,
    hours: number,
  ) => void;

  /**
   * Remove the assignment for a specific request + month.
   */
  clearMonthAssignment: (requestId: string, month: string) => void;

  /**
   * Persist all current assignments as draft (does NOT create Allocation rows).
   * Callers must do the actual API calls; this just clears the dirty flag.
   */
  markSaved: () => void;

  /**
   * Clear everything — called after a successful confirm, decline, or
   * explicit discard.
   */
  exit: () => void;

  /**
   * Return the current assignment list for a given requestId, formatted
   * for the `saveRequestAssignments` API call.
   */
  getRequestPayload: (
    requestId: string,
  ) => Array<{ month: string; assignments: { person_id: string; hours: number }[] }>;

  /**
   * Get all modified request IDs (those with at least one assignment entry).
   */
  getDirtyRequestIds: () => string[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AssignmentStateCtx = createContext<AssignmentStateActions | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AssignmentStateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AssignmentSession | null>(null);

  const enterAssignmentMode = useCallback(
    (
      projectId: string,
      ccId: string,
      crId?: number,
      entrySource: AssignmentEntrySource = 'url_param',
    ) => {
      setSession({
        projectId,
        ccId,
        crId,
        entrySource,
        assignments: new Map(),
        dirty: false,
      });
    },
    [],
  );

  const setMonthAssignment = useCallback(
    (requestId: string, month: string, personId: string, hours: number) => {
      setSession((prev) => {
        if (!prev) return prev;
        const nextAssignments: AssignmentMap = new Map(prev.assignments);
        const reqMap = new Map(nextAssignments.get(requestId) ?? []);
        // Single-person flow for W4 — replace the month's assignment
        reqMap.set(month, [{ personId, hours }]);
        nextAssignments.set(requestId, reqMap);
        return { ...prev, assignments: nextAssignments, dirty: true };
      });
    },
    [],
  );

  const clearMonthAssignment = useCallback((requestId: string, month: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextAssignments: AssignmentMap = new Map(prev.assignments);
      const reqMap = new Map(nextAssignments.get(requestId) ?? []);
      reqMap.delete(month);
      nextAssignments.set(requestId, reqMap);
      return { ...prev, assignments: nextAssignments, dirty: true };
    });
  }, []);

  const markSaved = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, dirty: false } : prev));
  }, []);

  const exit = useCallback(() => {
    setSession(null);
  }, []);

  const getRequestPayload = useCallback(
    (requestId: string) => {
      if (!session) return [];
      const reqMap = session.assignments.get(requestId);
      if (!reqMap) return [];
      const result: Array<{
        month: string;
        assignments: { person_id: string; hours: number }[];
      }> = [];
      reqMap.forEach((people, month) => {
        result.push({
          month,
          assignments: people.map((p) => ({
            person_id: p.personId,
            hours: p.hours,
          })),
        });
      });
      return result;
    },
    [session],
  );

  const getDirtyRequestIds = useCallback(() => {
    if (!session) return [];
    return Array.from(session.assignments.keys()).filter(
      (reqId) => (session.assignments.get(reqId)?.size ?? 0) > 0,
    );
  }, [session]);

  const value = useMemo<AssignmentStateActions>(
    () => ({
      session,
      enterAssignmentMode,
      setMonthAssignment,
      clearMonthAssignment,
      markSaved,
      exit,
      getRequestPayload,
      getDirtyRequestIds,
    }),
    [
      session,
      enterAssignmentMode,
      setMonthAssignment,
      clearMonthAssignment,
      markSaved,
      exit,
      getRequestPayload,
      getDirtyRequestIds,
    ],
  );

  return (
    <AssignmentStateCtx.Provider value={value}>
      {children}
    </AssignmentStateCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssignmentState(): AssignmentStateActions {
  const ctx = useContext(AssignmentStateCtx);
  if (!ctx) {
    throw new Error(
      'useAssignmentState must be used inside <AssignmentStateProvider>',
    );
  }
  return ctx;
}
