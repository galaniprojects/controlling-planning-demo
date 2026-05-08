/**
 * RoleSection — v5.2 W4 Track A (Session 6a).
 *
 * One collapsible section per `ResourceRequest` with request_type='resource'.
 * Fetches per-month hours + current assignments for its request.
 * Builds PersonCandidate list from the team heatmap.
 *
 * Structure:
 *   RoleSectionHeader (chevron, role name, meta, completion badge)
 *   [collapsible body]
 *   QuickFill (person picker + Fill button)
 *   MonthRow × N  (month grid)
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Role sections"
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';
import { capacityApi } from '@/api/endpoints';
import type { MonthlyHoursItem, RequestAssignment, PersonHeatmapRow } from '@/types/api';
import type { MonthPersonAssignment } from './AssignmentStateContext';
import type { PersonCandidate } from './PersonPicker';
import { RoleSectionHeader } from './RoleSectionHeader';
import { QuickFill } from './QuickFill';
import { MonthRow } from './MonthRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResourceRequestForSection {
  id: number;
  role_or_cost_type: string;
  hours_or_amount: number;
  original_hours: number | null;
  change_direction: 'increase' | 'decrease' | null;
  period_start: string;
  period_end: string;
  priority: string;
}

interface RoleSectionProps {
  ccId: string;
  request: ResourceRequestForSection;
  /** Role ID of this request, used to segregate "matching" vs "other" candidates */
  requestRoleId?: string;
  /** People in the cost centre (from team heatmap) */
  teamPeople: PersonHeatmapRow[];
  /** Current in-context assignment map for this request */
  assignedMap: Map<string, MonthPersonAssignment[]>;
  onAssign: (requestId: string, month: string, personId: string, hours: number) => void;
  onRemove: (requestId: string, month: string, personId: string) => void;
  /**
   * Add an additional person to a multi-person split (W5 S10, §9.5). The
   * fourth argument is a rebalance amount — non-zero only when the parent
   * wants to absorb the new person's hours from existing shares to keep
   * the requested-hours invariant.
   */
  onAddPerson?: (
    requestId: string,
    month: string,
    personId: string,
    hours: number,
    rebalanceAmount: number,
  ) => void;
  /** Projected utilisation per personId (best-effort from preview endpoint) */
  projectedUtils: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Generate ISO month sequence from period_start to period_end (inclusive)
// ---------------------------------------------------------------------------

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleSection({
  ccId,
  request,
  requestRoleId,
  teamPeople,
  assignedMap,
  onAssign,
  onRemove,
  onAddPerson,
  projectedUtils,
}: RoleSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [monthlyHours, setMonthlyHours] = useState<MonthlyHoursItem[]>([]);
  const [serverAssignments, setServerAssignments] = useState<RequestAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch monthly hours + current assignments from server
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      capacityApi.getRequestMonthlyHours(ccId, request.id),
      capacityApi.getRequestAssignments(ccId, request.id),
    ])
      .then(([hoursRes, assignRes]) => {
        if (cancelled) return;
        setMonthlyHours(hoursRes.items);
        setServerAssignments(assignRes.items);
      })
      .catch(() => {
        if (!cancelled) {
          setMonthlyHours([]);
          setServerAssignments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ccId, request.id]);

  // All months in this request's period
  const allMonths = useMemo(
    () => monthsBetween(request.period_start, request.period_end),
    [request.period_start, request.period_end],
  );

  // Build a map of month → MonthlyHoursItem for hours lookup
  const hoursMap = useMemo(() => {
    const m = new Map<string, MonthlyHoursItem>();
    monthlyHours.forEach((h) => m.set(h.month, h));
    return m;
  }, [monthlyHours]);

  // Merge server assignments into the local context map (context takes precedence)
  const effectiveAssignedMap = useMemo(() => {
    const merged = new Map<string, MonthPersonAssignment[]>();
    // Start with server assignments
    serverAssignments.forEach((a) => {
      const existing = merged.get(a.month) ?? [];
      merged.set(a.month, [
        ...existing,
        { personId: a.person_id, hours: a.hours },
      ]);
    });
    // Override with local context
    assignedMap.forEach((people, month) => {
      merged.set(month, people);
    });
    return merged;
  }, [serverAssignments, assignedMap]);

  // Build PersonCandidate list — one entry per team person
  const candidates: PersonCandidate[] = useMemo(() => {
    return teamPeople.map((p) => {
      // Current utilisation — average across visible months or the most recent
      const utils = p.utilization.map((u) => u.value);
      const avgUtil = utils.length
        ? utils.reduce((a, b) => a + b, 0) / utils.length
        : 0;
      return {
        personId: p.person_id,
        personName: p.name,
        currentUtilPct: avgUtil,
        matchesRole: requestRoleId
          ? p.person_id === requestRoleId // fallback check — real role match requires role_id on person
          : false,
      };
    });
  }, [teamPeople, requestRoleId]);

  // Completion: count months where effectiveAssignedMap has ≥1 assignment
  const assignedCount = useMemo(
    () =>
      allMonths.filter(
        (m) => (effectiveAssignedMap.get(m)?.length ?? 0) > 0,
      ).length,
    [allMonths, effectiveAssignedMap],
  );

  const handleAssign = useCallback(
    (month: string, personId: string, hours: number) => {
      onAssign(String(request.id), month, personId, hours);
    },
    [onAssign, request.id],
  );

  const handleRemove = useCallback(
    (month: string, personId: string) => {
      onRemove(String(request.id), month, personId);
    },
    [onRemove, request.id],
  );

  const handleAddPerson = useCallback(
    (month: string, personId: string, hours: number, rebalanceAmount: number) => {
      if (!onAddPerson) return;
      onAddPerson(String(request.id), month, personId, hours, rebalanceAmount);
    },
    [onAddPerson, request.id],
  );

  const handleQuickFill = useCallback(
    (personId: string, _personName: string, hours: number, months: string[]) => {
      months.forEach((m) => onAssign(String(request.id), m, personId, hours));
    },
    [onAssign, request.id],
  );

  if (loading) {
    return (
      <div className="space-y-1 px-1 py-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div>
      <RoleSectionHeader
        roleName={request.role_or_cost_type}
        hoursPerMonth={request.hours_or_amount}
        priority={request.priority}
        periodStart={request.period_start}
        periodEnd={request.period_end}
        assignedCount={assignedCount}
        totalMonths={allMonths.length}
        isExpanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {expanded && (
        <div className="space-y-0 pb-2">
          <QuickFill
            months={allMonths}
            assignedMap={effectiveAssignedMap}
            requestedHours={request.hours_or_amount}
            candidates={candidates}
            onFill={handleQuickFill}
          />

          <div className="divide-y divide-border">
            {allMonths.map((month) => {
              const monthHours = hoursMap.get(month)?.hours ?? request.hours_or_amount;
              const localAssignments = effectiveAssignedMap.get(month) ?? [];
              // Check if this month was removed by CR (original_hours present but current = 0)
              const isRemovedByCR = false; // §9.8: Removed months come from backend — not yet modelled

              return (
                <MonthRow
                  key={month}
                  month={month}
                  requestedHours={monthHours}
                  originalHours={request.original_hours}
                  changeDirection={request.change_direction}
                  isRemovedByCR={isRemovedByCR}
                  assignments={localAssignments}
                  projectedUtils={projectedUtils}
                  candidates={candidates}
                  ccId={ccId}
                  requestId={request.id}
                  onAssign={handleAssign}
                  onRemove={handleRemove}
                  onAddPerson={onAddPerson ? handleAddPerson : undefined}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
