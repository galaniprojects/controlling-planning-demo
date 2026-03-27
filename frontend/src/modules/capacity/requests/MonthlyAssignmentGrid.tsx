import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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
import { capacityApi } from '@/api/endpoints';
import { cn } from '@/lib/utils';
import { Split, Merge, Check } from 'lucide-react';
import type {
  CapacityRequestItem,
  MonthlyHoursItem,
  RequestAssignment,
  PersonHeatmapRow,
} from '@/types/api';

interface PersonOption {
  person_id: string;
  name: string;
  roleName: string;
  /** Utilization by month – { "2026-04": 72, ... } */
  utilizationByMonth: Record<string, number>;
}

interface MonthlyAssignmentGridProps {
  ccId: string;
  request: CapacityRequestItem;
  /** Flat list of people from the heatmap */
  availablePeople: PersonOption[];
  onAssignmentsChanged?: () => void;
}

export function MonthlyAssignmentGrid({
  ccId,
  request,
  availablePeople,
  onAssignmentsChanged,
}: MonthlyAssignmentGridProps) {
  const [monthlyHours, setMonthlyHours] = useState<MonthlyHoursItem[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // month → person_id
  const [isSplit, setIsSplit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load monthly hours and existing assignments
  useEffect(() => {
    setLoading(true);
    Promise.all([
      capacityApi.getRequestMonthlyHours(ccId, request.id),
      capacityApi.getRequestAssignments(ccId, request.id),
    ])
      .then(([hoursRes, assignRes]) => {
        setMonthlyHours(hoursRes.items);
        const map: Record<string, string> = {};
        for (const a of assignRes.items) {
          map[a.month] = a.person_id;
        }
        setAssignments(map);

        // If existing assignments have more than one distinct person, auto-enable split mode
        const uniquePeople = new Set(Object.values(map));
        if (uniquePeople.size > 1) {
          setIsSplit(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ccId, request.id]);

  const saveAssignments = useCallback(
    async (newAssignments: Record<string, string>) => {
      const entries = Object.entries(newAssignments)
        .filter(([, pid]) => pid)
        .map(([month, person_id]) => ({ month, person_id }));

      if (entries.length === 0) return;

      setSaving(true);
      setSaveResult(null);
      try {
        await capacityApi.saveRequestAssignments(ccId, request.id, entries);
        setSaveResult('Saved');
        onAssignmentsChanged?.();
        setTimeout(() => setSaveResult(null), 2000);
      } catch {
        setSaveResult('Save failed');
      } finally {
        setSaving(false);
      }
    },
    [ccId, request.id, onAssignmentsChanged],
  );

  const handleUnifiedChange = (personId: string) => {
    const newMap: Record<string, string> = {};
    for (const mh of monthlyHours) {
      newMap[mh.month] = personId;
    }
    setAssignments(newMap);
    saveAssignments(newMap);
  };

  const handleMonthChange = (month: string, personId: string) => {
    const newMap = { ...assignments, [month]: personId };
    setAssignments(newMap);
    saveAssignments(newMap);
  };

  const toggleSplit = () => {
    setIsSplit((s) => !s);
  };

  // Determine the "unified" person (if all months have the same person)
  const allPersonIds = monthlyHours.map((mh) => assignments[mh.month]).filter(Boolean);
  const uniquePersonIds = [...new Set(allPersonIds)];
  const unifiedPersonId = uniquePersonIds.length === 1 ? uniquePersonIds[0] : undefined;

  // Separate people by matching role vs others
  const matchingRole = availablePeople.filter(
    (p) => p.roleName.toLowerCase() === request.role_or_cost_type.toLowerCase(),
  );
  const otherPeople = availablePeople.filter(
    (p) => p.roleName.toLowerCase() !== request.role_or_cost_type.toLowerCase(),
  );

  const assignedCount = monthlyHours.filter((mh) => assignments[mh.month]).length;
  const totalMonths = monthlyHours.length;

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (monthlyHours.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">Resource Assignment</h4>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              assignedCount === totalMonths
                ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400',
            )}
          >
            {assignedCount}/{totalMonths} months assigned
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleSplit}
          className="text-xs gap-1"
        >
          {isSplit ? (
            <>
              <Merge className="h-3.5 w-3.5" />
              Unified
            </>
          ) : (
            <>
              <Split className="h-3.5 w-3.5" />
              Split by Month
            </>
          )}
        </Button>
      </div>

      {!isSplit ? (
        /* Unified mode: single select for all months */
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Assign one person to all {totalMonths} months:
          </label>
          <PersonSelect
            value={unifiedPersonId ?? ''}
            onValueChange={handleUnifiedChange}
            matchingRole={matchingRole}
            otherPeople={otherPeople}
            placeholder="Select employee..."
          />
          {unifiedPersonId && (
            <div className="rounded border border-border/50 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/50">
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Month</th>
                    <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Hours</th>
                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHours.map((mh) => {
                    const person = availablePeople.find((p) => p.person_id === assignments[mh.month]);
                    return (
                      <tr key={mh.month} className="border-b border-border/30">
                        <td className="px-2 py-1.5 text-muted-foreground">{formatMonth(mh.month)}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{mh.hours}h</td>
                        <td className="px-2 py-1.5">
                          {person ? (
                            <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                              <Check className="h-3 w-3" />
                              {person.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Split mode: per-month selects */
        <div className="rounded border border-border/50 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Month</th>
                <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Hours</th>
                <th className="px-2 py-1.5 text-left text-muted-foreground font-medium min-w-[200px]">
                  Assigned Employee
                </th>
              </tr>
            </thead>
            <tbody>
              {monthlyHours.map((mh) => (
                <tr key={mh.month} className="border-b border-border/30">
                  <td className="px-2 py-1.5 text-muted-foreground">{formatMonth(mh.month)}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{mh.hours}h</td>
                  <td className="px-2 py-1.5">
                    <PersonSelect
                      value={assignments[mh.month] ?? ''}
                      onValueChange={(pid) => handleMonthChange(mh.month, pid)}
                      matchingRole={matchingRole}
                      otherPeople={otherPeople}
                      placeholder="Select..."
                      compact
                      month={mh.month}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saving && <p className="text-xs text-muted-foreground">Saving...</p>}
      {saveResult && (
        <p
          className={cn(
            'text-xs',
            saveResult === 'Saved' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {saveResult}
        </p>
      )}
    </div>
  );
}

/* ---- Person Select Dropdown ---- */

function PersonSelect({
  value,
  onValueChange,
  matchingRole,
  otherPeople,
  placeholder,
  compact,
  month,
}: {
  value: string;
  onValueChange: (val: string) => void;
  matchingRole: PersonOption[];
  otherPeople: PersonOption[];
  placeholder: string;
  compact?: boolean;
  month?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn(compact ? 'h-7 text-xs' : 'h-8 text-sm')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {matchingRole.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground">Matching Role</SelectLabel>
            {matchingRole.map((p) => (
              <SelectItem key={p.person_id} value={p.person_id}>
                <span className="flex items-center gap-2">
                  <span>{p.name}</span>
                  {month && p.utilizationByMonth[month] !== undefined && (
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
                  {month && p.utilizationByMonth[month] !== undefined && (
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
  );
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}
