/**
 * MonthRow — v5.2 W4 Track A (Session 6a) + v5.2 W5 Track C (Session 10).
 *
 * Renders a single month's assignment row within a RoleSection.
 *
 * States:
 *   - Unassigned: "── unassigned ──" placeholder + [Assign] button
 *   - Assigned (single): PersonChip + [+ Add] button (multi-person split, W5)
 *   - Assigned (multi): PersonChip × N + [+ Add] (when sum < requested) +
 *     "Nh remaining" indicator if partial
 *   - Removed by CR: struck-through row with "Removed by CR" note
 *   - CR diff: hours displayed as "80h → 120h (+40h)" with color
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2, §9.5, §9.8
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
  /**
   * Add an additional person to the month's split (W5 S10, spec §9.5).
   * The fourth argument is the rebalance amount — non-zero only when the
   * new total would exceed the requested hours and the parent wants to
   * keep the requested-hours invariant.
   */
  onAddPerson?: (
    month: string,
    personId: string,
    hours: number,
    rebalanceAmount: number,
  ) => void;
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
  onAddPerson,
}: MonthRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const isAssigned = assignments.length > 0;

  // -- Multi-person split math (§9.5) ---------------------------------------
  // assignedTotal = sum of all current per-person hours.
  // remainingHours = how much more can be added before the sum equals
  //                  requestedHours. Negative values are clamped to 0.
  const assignedTotal = assignments.reduce((acc, a) => acc + a.hours, 0);
  const remainingHours = Math.max(0, requestedHours - assignedTotal);
  const isPartial = isAssigned && assignedTotal < requestedHours;
  // [+ Add] is offered while there's room or while the existing list is
  // small enough that a rebalance would still leave the largest at >0.
  const canAddMore = isAssigned && (remainingHours > 0 || assignments.length < 5);
  const excludedIds = assignments.map((a) => a.personId);

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
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {isAssigned ? (
          <>
            {assignments.map((a) => {
              const projPct = projectedUtils.get(a.personId) ?? 0;
              // We need the person name — look it up from candidates
              const cand = candidates.find((c) => c.personId === a.personId);
              const personName = cand?.personName ?? a.personId;
              // Show hours on the chip when the month has a multi-person
              // split or when the single-person assignment is partial. A
              // single-person 100% chip stays compact.
              const showHours =
                assignments.length > 1 || a.hours !== requestedHours;
              return (
                <PersonChip
                  key={a.personId}
                  personName={personName}
                  projectedUtilPct={projPct}
                  hours={showHours ? a.hours : undefined}
                  showPartialIndicator={isPartial && assignments.length === 1}
                  onRemove={() => onRemove(month, a.personId)}
                />
              );
            })}

            {/* "Xh remaining" indicator — only when partial and not at the
                add-picker threshold. Helps the CC Owner spot incomplete
                splits at a glance per §9.5 ("partially assigned"). */}
            {isPartial && remainingHours > 0 && !addPickerOpen && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                {remainingHours}h remaining
              </span>
            )}

            {/* [+ Add] — opens the multi-person split picker (§9.5). */}
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    disabled={!canAddMore || !onAddPerson}
                    onClick={() => {
                      if (canAddMore && onAddPerson) setAddPickerOpen(true);
                    }}
                  >
                    + Add
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {canAddMore
                    ? remainingHours > 0
                      ? `Split ${remainingHours}h with another person`
                      : 'Split with another person (rebalances existing share)'
                    : 'Split limit reached'}
                </TooltipContent>
              </Tooltip>
              {addPickerOpen && onAddPerson && (
                <PersonPicker
                  ccId={ccId}
                  requestId={requestId}
                  month={month}
                  requestedHours={requestedHours}
                  candidates={candidates}
                  showHoursInput
                  defaultHours={
                    remainingHours > 0
                      ? remainingHours
                      : Math.max(1, Math.floor(requestedHours / 2))
                  }
                  excludedPersonIds={excludedIds}
                  onSelect={(personId, _personName, hours) => {
                    // Only rebalance when the requested split would over-
                    // commit (sum > requestedHours). When room remains
                    // (remainingHours > 0), just append without touching
                    // existing shares.
                    const overflow =
                      assignedTotal + hours - requestedHours;
                    const rebalanceAmount = Math.max(0, overflow);
                    onAddPerson(month, personId, hours, rebalanceAmount);
                    setAddPickerOpen(false);
                  }}
                  onClose={() => setAddPickerOpen(false)}
                />
              )}
            </div>
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
