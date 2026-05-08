/**
 * useAssignmentOverlay — v5.2 W5 Track A (S6b, spec §9.4 / §9.6 / §9.8).
 *
 * Hook that, while assignment mode is active, fetches the project + per-
 * request data needed to draw ghost segments on the timeline, then folds
 * everything (with the heatmap-derived `PersonRowData` list) into a
 * `GhostMap` keyed by `personId × month`.
 *
 * The hook is read-only with respect to the assignment session — it
 * pulls `session` from `useAssignmentState()` (set by `AssignmentEntry-
 * Point` and `AssignmentPanel`) but never writes back. Mutations come
 * exclusively from the gesture handlers in `PersonTimelineRow`.
 *
 * Data sources (re-uses the same endpoints `AssignmentPanel` already
 * fetches — duplicate request count is one extra fetch per request, all
 * in parallel; the demo dataset's request counts are small enough that
 * this is acceptable):
 *   - `getProjectAssignmentDetail(projectId, crId)` → project + requests
 *   - `getRequestMonthlyHours(ccId, requestId)` per resource request
 *   - `getRequestAssignments(ccId, requestId)`     per resource request
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.4 + §9.6 + §9.8.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import type {
  ProjectAssignmentDetail,
  MonthlyHoursItem,
  RequestAssignment,
} from '@/types/api';
import { useAssignmentState } from '../assignment/AssignmentStateContext';
import type { ScopedTimelineData } from '../hooks/useScopedTimelineData';
import {
  buildGhostMap,
  extractRequestInputs,
  type GhostMap,
  type PersonOverlayInput,
} from './assignmentGhostOverlay';

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------

export interface AssignmentOverlay {
  /** True when an assignment session is open (and the timeline should switch into overlay mode). */
  active: boolean;
  /** Project ID under assignment; null when inactive. */
  projectId: string | null;
  /** CC ID the session is scoped to; null when inactive. */
  ccId: string | null;
  /** Set of role labels (`role_or_cost_type`) referenced by the session's resource requests — used by RoleGroup auto-expand. */
  matchingRoleLabels: Set<string>;
  /** `personId → month → GhostSegment[]` (empty map while loading). */
  ghostMap: GhostMap;
  /** True while overlay data is in flight. */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Compute the overlay for the current session against the visible
 * timeline rows. Pass the same `ScopedTimelineData` snapshot that
 * `CapacityTimeline` renders so candidate matching uses the exact same
 * person/role labels the user sees.
 */
export function useAssignmentOverlay(
  data: ScopedTimelineData,
): AssignmentOverlay {
  const { session } = useAssignmentState();
  const active = session !== null;
  const projectId = session?.projectId ?? null;
  const ccId = session?.ccId ?? null;
  const crId = session?.crId;

  // Fetched data — keyed on (projectId, ccId, crId) so a session change
  // refetches without leaking stale rows.
  const [detail, setDetail] = useState<ProjectAssignmentDetail | null>(null);
  const [monthlyHoursByRequest, setMonthlyHoursByRequest] = useState<
    Map<string, MonthlyHoursItem[]>
  >(new Map());
  const [serverAssignmentsByRequest, setServerAssignmentsByRequest] =
    useState<Map<string, RequestAssignment[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchTokenRef = useRef(0);

  useEffect(() => {
    if (!active || !projectId || !ccId) {
      // Reset on session exit so a stale ghost map doesn't survive into
      // the next interaction (e.g. clicking a person row → person detail).
      setDetail(null);
      setMonthlyHoursByRequest(new Map());
      setServerAssignmentsByRequest(new Map());
      setLoading(false);
      return;
    }

    const token = ++fetchTokenRef.current;
    setLoading(true);

    // Step 1: project detail. Step 2: per-request monthly hours +
    // assignments (parallel). Wraps each fetch in a defensive `.catch`
    // so a single request's 404 doesn't tank the whole overlay.
    capacityApi
      .getProjectAssignmentDetail(projectId, crId)
      .then(async (det) => {
        if (token !== fetchTokenRef.current) return;
        const resourceRequests = det.requests.filter(
          (r) => r.request_type === 'resource' && r.status === 'pending',
        );
        const hoursPromises = resourceRequests.map(async (r) => {
          try {
            const res = await capacityApi.getRequestMonthlyHours(ccId, r.id);
            return [String(r.id), res.items] as const;
          } catch {
            return [String(r.id), [] as MonthlyHoursItem[]] as const;
          }
        });
        const assignsPromises = resourceRequests.map(async (r) => {
          try {
            const res = await capacityApi.getRequestAssignments(ccId, r.id);
            return [String(r.id), res.items] as const;
          } catch {
            return [String(r.id), [] as RequestAssignment[]] as const;
          }
        });
        const [hoursPairs, assignsPairs] = await Promise.all([
          Promise.all(hoursPromises),
          Promise.all(assignsPromises),
        ]);
        if (token !== fetchTokenRef.current) return;
        setDetail(det);
        setMonthlyHoursByRequest(new Map(hoursPairs));
        setServerAssignmentsByRequest(new Map(assignsPairs));
      })
      .catch(() => {
        if (token !== fetchTokenRef.current) return;
        setDetail(null);
        setMonthlyHoursByRequest(new Map());
        setServerAssignmentsByRequest(new Map());
      })
      .finally(() => {
        if (token === fetchTokenRef.current) setLoading(false);
      });
  }, [active, projectId, ccId, crId]);

  // Build the ghost map from the fetched payload + the visible person
  // rows. Re-runs on every dataset update or session-assignment edit so
  // ghosts react live to clicks (per §9.4 last paragraph: "All other ghost
  // segments on ALL people in the timeline recalculate immediately").
  const overlay = useMemo<AssignmentOverlay>(() => {
    if (!active || !projectId || !detail) {
      return {
        active,
        projectId,
        ccId,
        matchingRoleLabels: new Set<string>(),
        ghostMap: new Map(),
        loading,
      };
    }

    // Build candidate person inputs from the timeline data. Role view
    // and Person view both surface the same `PersonRowData[]` shape; we
    // union them so the overlay covers whichever is rendering.
    const seen = new Set<string>();
    const people: PersonOverlayInput[] = [];
    const collect = (rows: typeof data.flatPeople) => {
      for (const p of rows) {
        if (seen.has(p.personId)) continue;
        seen.add(p.personId);
        people.push({
          personId: p.personId,
          personName: p.personName,
          roleLabel: p.roleName,
          cellsByMonth: p.cellsByMonth,
        });
      }
    };
    collect(data.flatPeople);
    for (const g of data.roleGroups) collect(g.people);

    const requests = extractRequestInputs(
      detail,
      monthlyHoursByRequest,
      serverAssignmentsByRequest,
    );
    const matchingRoleLabels = new Set(requests.map((r) => r.roleLabel));

    const ghostMap = buildGhostMap({
      projectId,
      projectName: detail.project.name,
      requests,
      people,
      sessionAssignments: session?.assignments ?? new Map(),
    });

    return {
      active,
      projectId,
      ccId,
      matchingRoleLabels,
      ghostMap,
      loading,
    };
  }, [
    active,
    projectId,
    ccId,
    detail,
    monthlyHoursByRequest,
    serverAssignmentsByRequest,
    data.flatPeople,
    data.roleGroups,
    session?.assignments,
    loading,
  ]);

  return overlay;
}
