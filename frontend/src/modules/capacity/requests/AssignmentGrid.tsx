import { useState, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCollapsibleYears } from '@/hooks/useCollapsibleYears';
import { capacityApi } from '@/api/endpoints';
import type { ProjectAssignmentRequestItem, MonthlyHoursItem } from '@/types/api';

export interface PersonOption {
  person_id: string;
  name: string;
  roleName: string;
  utilizationByMonth: Record<string, number>;
}

export interface RequestGridData {
  hours: MonthlyHoursItem[];
  assignments: Record<string, string>; // month → person_id
}

interface AssignmentGridProps {
  ccId: string;
  requests: ProjectAssignmentRequestItem[];
  gridData: Map<number, RequestGridData>;
  availablePeople: PersonOption[];
  allMonths: string[];
  onAssignmentSaved: () => void;
  onGridDataChange: (reqId: number, month: string, personId: string) => void;
  onGridDataBulkChange: (reqId: number, months: string[], personId: string) => void;
}

function monthLabel(month: string): string {
  const [, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(m, 10) - 1] || m;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

/** Check if a month falls within the request's period */
function isMonthInRange(month: string, start: string, end: string): boolean {
  return month >= start && month <= end;
}

export function AssignmentGrid({
  ccId,
  requests,
  gridData,
  availablePeople,
  allMonths,
  onAssignmentSaved,
  onGridDataChange,
  onGridDataBulkChange,
}: AssignmentGridProps) {
  const { yearGroups, toggleYear, visibleColumns } = useCollapsibleYears(allMonths);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [savingReqs, setSavingReqs] = useState<Set<number>>(new Set());

  const handleAssign = useCallback(
    async (reqId: number, month: string, personId: string) => {
      // Optimistic update
      onGridDataChange(reqId, month, personId);
      setEditingCell(null);

      // Build full assignment array for this request
      const reqData = gridData.get(reqId);
      const currentAssignments = reqData ? { ...reqData.assignments } : {};
      currentAssignments[month] = personId;

      const entries = Object.entries(currentAssignments)
        .filter(([, pid]) => pid)
        .map(([m, pid]) => ({ month: m, person_id: pid }));

      if (entries.length === 0) return;

      setSavingReqs((prev) => new Set(prev).add(reqId));
      try {
        await capacityApi.saveRequestAssignments(ccId, reqId, entries);
        onAssignmentSaved();
      } catch {
        // Could revert here, but fetchDetail in parent will correct state
      } finally {
        setSavingReqs((prev) => {
          const next = new Set(prev);
          next.delete(reqId);
          return next;
        });
      }
    },
    [ccId, gridData, onAssignmentSaved, onGridDataChange],
  );

  const handleAssignAll = useCallback(
    async (reqId: number, personId: string) => {
      const reqData = gridData.get(reqId);
      const months = reqData?.hours.map((h) => h.month) ?? [];
      if (months.length === 0) return;

      // Optimistic bulk update
      onGridDataBulkChange(reqId, months, personId);
      setEditingCell(null);

      const entries = months.map((m) => ({ month: m, person_id: personId }));

      setSavingReqs((prev) => new Set(prev).add(reqId));
      try {
        await capacityApi.saveRequestAssignments(ccId, reqId, entries);
        onAssignmentSaved();
      } catch {
        // fetchDetail in parent will correct state
      } finally {
        setSavingReqs((prev) => {
          const next = new Set(prev);
          next.delete(reqId);
          return next;
        });
      }
    },
    [ccId, gridData, onAssignmentSaved, onGridDataBulkChange],
  );

  if (requests.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            {/* Row 1: Year headers */}
            <tr className="bg-muted/50 border-b border-border">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[220px] min-w-[220px]">
                Role
              </th>
              <th className="px-1 py-1.5 text-center text-xs font-medium text-muted-foreground w-[70px] min-w-[70px] border-r border-border">
                All
              </th>
              {yearGroups.map((yg) => (
                <th
                  key={yg.year}
                  colSpan={yg.isExpanded ? yg.months.length : 1}
                  className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted"
                  onClick={() => toggleYear(yg.year)}
                >
                  {yg.year} {yg.isExpanded ? '\u25B4' : '\u25BE'}
                </th>
              ))}
              <th className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground w-[80px]">
                Status
              </th>
            </tr>
            {/* Row 2: Month sub-headers */}
            <tr className="bg-muted/50 border-b border-border">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-1 text-left text-xs text-muted-foreground" />
              <th className="px-1 py-1 text-center text-xs text-muted-foreground border-r border-border" />
              {visibleColumns.map((col) =>
                col.type === 'month' ? (
                  <th
                    key={col.key}
                    className={cn(
                      'px-1 py-1 text-center text-xs text-muted-foreground min-w-[90px]',
                      col.isJanuary && 'border-l-2 border-l-border',
                    )}
                  >
                    {monthLabel(col.key)}
                  </th>
                ) : (
                  <th key={`ys-${col.year}`} className="px-1 py-1 text-center text-xs text-muted-foreground min-w-[90px]">
                    Summary
                  </th>
                ),
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {/* Section header */}
            <tr className="bg-primary/5">
              <td
                colSpan={visibleColumns.length + 3}
                className="px-3 py-1.5 text-xs font-semibold text-primary uppercase tracking-wide"
              >
                Internal Resources
              </td>
            </tr>
            {/* One row per resource request */}
            {requests.map((req) => (
              <AssignmentRow
                key={req.id}
                request={req}
                reqData={gridData.get(req.id)}
                availablePeople={availablePeople}
                visibleColumns={visibleColumns}
                allMonths={allMonths}
                editingCell={editingCell}
                onEditStart={setEditingCell}
                onAssign={handleAssign}
                onAssignAll={handleAssignAll}
                isSaving={savingReqs.has(req.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- Assignment Row ---- */

interface AssignmentRowProps {
  request: ProjectAssignmentRequestItem;
  reqData: RequestGridData | undefined;
  availablePeople: PersonOption[];
  visibleColumns: ReturnType<typeof useCollapsibleYears>['visibleColumns'];
  allMonths: string[];
  editingCell: string | null;
  onEditStart: (cellId: string | null) => void;
  onAssign: (reqId: number, month: string, personId: string) => void;
  onAssignAll: (reqId: number, personId: string) => void;
  isSaving: boolean;
}

function AssignmentRow({
  request,
  reqData,
  availablePeople,
  visibleColumns,
  editingCell,
  onEditStart,
  onAssign,
  onAssignAll,
  isSaving,
}: AssignmentRowProps) {
  const assignments = reqData?.assignments ?? {};

  // Count assigned months
  const monthsInRange = reqData?.hours.map((h) => h.month) ?? [];
  const assignedCount = monthsInRange.filter((m) => assignments[m]).length;
  const totalMonths = monthsInRange.length;
  const fullyAssigned = assignedCount >= totalMonths && totalMonths > 0;

  // Determine the unified person (if all months have the same person)
  const allAssignedIds = monthsInRange.map((m) => assignments[m]).filter(Boolean);
  const uniqueAssignedIds = [...new Set(allAssignedIds)];
  const unifiedPersonId = uniqueAssignedIds.length === 1 && allAssignedIds.length === totalMonths
    ? uniqueAssignedIds[0]
    : undefined;

  // Separate people by matching role
  const matchingRole = availablePeople.filter(
    (p) => p.roleName.toLowerCase() === request.role_or_cost_type.toLowerCase(),
  );
  const otherPeople = availablePeople.filter(
    (p) => p.roleName.toLowerCase() !== request.role_or_cost_type.toLowerCase(),
  );

  const allCellId = `${request.id}:__all__`;
  const isEditingAll = editingCell === allCellId;
  const unifiedPerson = unifiedPersonId
    ? availablePeople.find((p) => p.person_id === unifiedPersonId)
    : null;

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20">
      {/* Sticky left: role info */}
      <td className="sticky left-0 z-10 bg-card px-3 py-2 whitespace-nowrap border-r border-border/50">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{request.role_or_cost_type}</span>
          <span className="text-[11px] text-muted-foreground">
            {request.hours_or_amount}h avg/mo | {request.priority}
          </span>
        </div>
      </td>
      {/* Assign All cell */}
      <td className="px-0.5 py-1.5 text-center border-r border-border">
        {isEditingAll ? (
          <Select
            value={unifiedPersonId || ''}
            onValueChange={(pid) => onAssignAll(request.id, pid)}
            onOpenChange={(open) => {
              if (!open) onEditStart(null);
            }}
            defaultOpen
          >
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {matchingRole.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Matching Role</SelectLabel>
                  {matchingRole.map((p) => (
                    <SelectItem key={p.person_id} value={p.person_id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {matchingRole.length > 0 && otherPeople.length > 0 && <SelectSeparator />}
              {otherPeople.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Other Roles</SelectLabel>
                  {otherPeople.map((p) => (
                    <SelectItem key={p.person_id} value={p.person_id}>
                      <span className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.roleName}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        ) : (
          <button
            type="button"
            onClick={() => onEditStart(allCellId)}
            className={cn(
              'w-full rounded px-1 py-1 text-xs transition-colors',
              unifiedPerson
                ? 'bg-primary/5 text-primary hover:bg-primary/10'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            )}
            title="Assign one person to all months"
          >
            {unifiedPerson ? shortName(unifiedPerson.name) : 'All'}
          </button>
        )}
      </td>
      {/* Month cells */}
      {visibleColumns.map((col) => {
        if (col.type === 'yearSummary') {
          return (
            <YearSummaryCell
              key={`ys-${col.year}`}
              months={col.months}
              assignments={assignments}
              availablePeople={availablePeople}
              periodStart={request.period_start}
              periodEnd={request.period_end}
            />
          );
        }

        const month = col.key;
        const inRange = isMonthInRange(month, request.period_start, request.period_end);
        const cellId = `${request.id}:${month}`;
        const isEditing = editingCell === cellId;
        const assignedPersonId = assignments[month];
        const assignedPerson = assignedPersonId
          ? availablePeople.find((p) => p.person_id === assignedPersonId)
          : null;

        if (!inRange) {
          return (
            <td
              key={month}
              className={cn(
                'px-1 py-1.5 text-center min-w-[90px] bg-muted/50',
                col.isJanuary && 'border-l-2 border-l-border',
              )}
            >
              <span className="text-muted-foreground/40">--</span>
            </td>
          );
        }

        if (isEditing) {
          return (
            <td
              key={month}
              className={cn(
                'px-0.5 py-0.5 min-w-[90px]',
                col.isJanuary && 'border-l-2 border-l-border',
              )}
            >
              <Select
                value={assignedPersonId || ''}
                onValueChange={(pid) => onAssign(request.id, month, pid)}
                onOpenChange={(open) => {
                  if (!open) onEditStart(null);
                }}
                defaultOpen
              >
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {matchingRole.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-xs text-muted-foreground">Matching Role</SelectLabel>
                      {matchingRole.map((p) => (
                        <SelectItem key={p.person_id} value={p.person_id}>
                          <span className="flex items-center gap-2">
                            <span>{p.name}</span>
                            {p.utilizationByMonth[month] !== undefined && (
                              <span
                                className={cn(
                                  'text-xs',
                                  p.utilizationByMonth[month] > 90
                                    ? 'text-red-500'
                                    : p.utilizationByMonth[month] > 70
                                      ? 'text-amber-500'
                                      : 'text-green-600',
                                )}
                              >
                                {Math.round(p.utilizationByMonth[month])}%
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {matchingRole.length > 0 && otherPeople.length > 0 && <SelectSeparator />}
                  {otherPeople.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-xs text-muted-foreground">Other Roles</SelectLabel>
                      {otherPeople.map((p) => (
                        <SelectItem key={p.person_id} value={p.person_id}>
                          <span className="flex items-center gap-2">
                            <span>{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.roleName}</span>
                            {p.utilizationByMonth[month] !== undefined && (
                              <span
                                className={cn(
                                  'text-xs',
                                  p.utilizationByMonth[month] > 90
                                    ? 'text-red-500'
                                    : p.utilizationByMonth[month] > 70
                                      ? 'text-amber-500'
                                      : 'text-green-600',
                                )}
                              >
                                {Math.round(p.utilizationByMonth[month])}%
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </td>
          );
        }

        return (
          <td
            key={month}
            className={cn(
              'px-1 py-1.5 text-center min-w-[90px]',
              col.isJanuary && 'border-l-2 border-l-border',
            )}
          >
            <button
              type="button"
              onClick={() => onEditStart(cellId)}
              className={cn(
                'w-full rounded px-1.5 py-1 text-xs transition-colors',
                assignedPerson
                  ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30'
                  : 'bg-amber-50 text-amber-400 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30',
              )}
            >
              {assignedPerson ? shortName(assignedPerson.name) : '--'}
            </button>
          </td>
        );
      })}
      {/* Status column */}
      <td className="px-2 py-1.5 text-center">
        <Badge
          variant="outline"
          className={cn(
            'text-xs whitespace-nowrap',
            fullyAssigned ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
          )}
        >
          {isSaving ? '...' : `${assignedCount}/${totalMonths}`}
        </Badge>
      </td>
    </tr>
  );
}

/* ---- Year Summary Cell ---- */

function YearSummaryCell({
  months,
  assignments,
  availablePeople,
  periodStart,
  periodEnd,
}: {
  months: string[];
  assignments: Record<string, string>;
  availablePeople: PersonOption[];
  periodStart: string;
  periodEnd: string;
}) {
  const inRangeMonths = months.filter((m) => isMonthInRange(m, periodStart, periodEnd));

  if (inRangeMonths.length === 0) {
    return (
      <td className="px-1 py-1.5 text-center min-w-[90px] bg-muted/50">
        <span className="text-muted-foreground/40">--</span>
      </td>
    );
  }

  const assignedIds = inRangeMonths.map((m) => assignments[m]).filter(Boolean);
  const uniqueIds = [...new Set(assignedIds)];

  let label: string;
  let style: string;

  if (assignedIds.length === 0) {
    label = '--';
    style = 'text-muted-foreground';
  } else if (uniqueIds.length === 1) {
    const person = availablePeople.find((p) => p.person_id === uniqueIds[0]);
    label = person ? shortName(person.name) : '--';
    style = assignedIds.length === inRangeMonths.length ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';
  } else {
    label = 'Mixed';
    style = 'text-muted-foreground italic';
  }

  return (
    <td className="px-1 py-1.5 text-center min-w-[90px]">
      <span className={cn('text-xs', style)}>{label}</span>
    </td>
  );
}
