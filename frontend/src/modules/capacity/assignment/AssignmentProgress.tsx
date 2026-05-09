/**
 * AssignmentProgress — v5.2 W4 Track A (Session 6a) +
 * v5.2 W5 Track C (Session 10).
 *
 * Shows overall assignment completion for the project:
 *   "14 of 19 months assigned"  +  proportional progress bar.
 *
 * When some months are partially assigned (sum(hours) < requestedHours per
 * §9.5), a secondary line is rendered:
 *   "12 full · 2 partial · 5 unassigned"
 *
 * Color:
 *   - Info-blue when incomplete (< 100%)
 *   - Amber when fully filled but with partial months (acknowledges
 *     fulfilment is below requested hours)
 *   - Success-green when 100% AND no partial months
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 + §9.5
 */

interface AssignmentProgressProps {
  /** Months with at least one person assigned (full + partial). */
  assigned: number;
  /** Total months across all role requests. */
  total: number;
  /** Months where sum(hours) < requestedHours (subset of `assigned`). */
  partial?: number;
}

export function AssignmentProgress({
  assigned,
  total,
  partial = 0,
}: AssignmentProgressProps) {
  const pct = total === 0 ? 100 : Math.round((assigned / total) * 100);
  const fullyAssignedAllMonths = assigned >= total && total > 0;
  const allFull = fullyAssignedAllMonths && partial === 0;
  const fullyCovered = fullyAssignedAllMonths && partial > 0;
  const fullCount = Math.max(0, assigned - partial);
  const unassignedCount = Math.max(0, total - assigned);

  const colorClass = allFull
    ? 'text-green-600 dark:text-green-400'
    : fullyCovered
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-blue-600 dark:text-blue-400';

  const barClass = allFull
    ? 'bg-green-500 dark:bg-green-400'
    : fullyCovered
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-blue-500 dark:bg-blue-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {assigned} of {total} months assigned
        </span>
        <span className={`font-medium ${colorClass}`}>{pct}%</span>
      </div>

      {/* Detail line — only when there's something to disambiguate. */}
      {(partial > 0 || (assigned > 0 && unassignedCount > 0)) && (
        <div className="text-[11px] text-muted-foreground">
          <span className="text-green-600 dark:text-green-400">
            {fullCount} full
          </span>
          {partial > 0 && (
            <>
              {' · '}
              <span className="text-amber-600 dark:text-amber-400">
                {partial} partial
              </span>
            </>
          )}
          {unassignedCount > 0 && (
            <>
              {' · '}
              <span>{unassignedCount} unassigned</span>
            </>
          )}
        </div>
      )}

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
