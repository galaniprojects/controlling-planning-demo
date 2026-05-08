/**
 * MonthRow — v5.2 W4 Track A (Session 6a).
 *
 * Renders a single month's assignment row within a RoleSection.
 *
 * States:
 *   - Unassigned: "── unassigned ──" placeholder + [Assign] button
 *   - Assigned: PersonChip + [+ Add] button (disabled in W4, enabled W5 S10)
 *   - Removed by CR: struck-through row with "Removed by CR" note
 *   - CR diff: hours displayed as "80h → 120h (+40h)" with color
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2, §9.8
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PersonChip } from './PersonChip';
import { PersonPicker } from './PersonPicker';
import type { PersonCandidate } from './PersonPicker';
import type { MonthPersonAssignment } from './AssignmentStateContext';

// ---------------------------------------------------------------------------
// Month label formatter: "2026-06" → "Jun 2026"
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

function fmtMonth(iso: string): string {
  const [year, mon] = iso.split('-');
  const idx = parseInt(mon, 10) - 1;
  return `${MONTH_NAMES[idx] ?? mon} ${year}`;
}

// ---------------------------------------------------------------------------
// Hours diff display
// ---------------------------------------------------------------------------

interface HoursDisplayProps {
  hours: number;
  originalHours: number | null;
  changeDirection: 'increase' | 'decrease' | null;
}

function HoursDisplay({ hours, originalHours, changeDirection }: HoursDisplayProps) {
  if (!changeDirection || originalHours === null) {
    return <span className="text-xs text-muted-foreground">{hours}h</span>;
  }

  const delta = hours - originalHours;
  const sign = delta > 0 ? '+' : '';
  const colorClass =
    changeDirection === 'increase'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-orange-600 dark:text-orange-400';

  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {originalHours}h → {hours}h ({sign}{delta}h)
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MonthRowProps {
  month: string;
  requestedHours: number;
  originalHours: number | null;
  changeDirection: 'increase' | 'decrease' | null;
  isRemovedByCR: boolean;
  assignments: MonthPersonAssignment[];
  /** Projected utilisation per person (keyed by personId) */
  projectedUtils: Map<string, number>;
  candidates: PersonCandidate[];
  ccId: string;
  requestId: number;
  onAssign: (month: string, personId: string, hours: number) => void;
  onRemove: (month: string, personId: string) => void;
}

export function MonthRow({
  month,
  requestedHours,
  originalHours,
  changeDirection,
  isRemovedByCR,
  assignments,
  projectedUtils,
  candidates,
  ccId,
  requestId,
  onAssign,
  onRemove,
}: MonthRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isAssigned = assignments.length > 0;

  // Struck-through row for months removed by CR
  if (isRemovedByCR) {
    return (
      <div className="flex items-center justify-between py-1.5 px-1 opacity-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground line-through">{fmtMonth(month)}</span>
          <span className="text-xs text-muted-foreground line-through">{requestedHours}h</span>
        </div>
        <span className="text-[10px] text-muted-foreground italic">Removed by CR</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-between py-1.5 px-1 text-xs">
      {/* Left: month label + hours */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-16 text-muted-foreground">{fmtMonth(month)}</span>
        <HoursDisplay
          hours={requestedHours}
          originalHours={originalHours}
          changeDirection={changeDirection}
        />
      </div>

      {/* Right: assignment slot + action */}
      <div className="flex items-center gap-1">
        {isAssigned ? (
          <>
            {assignments.map((a) => {
              const projPct = projectedUtils.get(a.personId) ?? 0;
              // We need the person name — look it up from candidates
              const cand = candidates.find((c) => c.personId === a.personId);
              const personName = cand?.personName ?? a.personId;
              return (
                <PersonChip
                  key={a.personId}
                  personName={personName}
                  projectedUtilPct={projPct}
                  onRemove={() => onRemove(month, a.personId)}
                />
              );
            })}
            {/* [+ Add] — rendered but disabled until W5 S10 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    disabled
                  >
                    + Add
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Multi-person split (Wave 5)
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="relative flex items-center gap-1">
            <span className="text-muted-foreground/60 text-[11px]">── unassigned ──</span>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-2 text-[10px]"
              onClick={() => setPickerOpen(true)}
            >
              Assign
            </Button>
            {pickerOpen && (
              <PersonPicker
                ccId={ccId}
                requestId={requestId}
                month={month}
                requestedHours={requestedHours}
                candidates={candidates}
                onSelect={(personId, _personName, hours) => {
                  onAssign(month, personId, hours);
                  setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
