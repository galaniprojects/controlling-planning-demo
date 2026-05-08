/**
 * AssignmentProgress — v5.2 W4 Track A (Session 6a).
 *
 * Shows overall assignment completion for the project:
 *   "14 of 19 months assigned"  +  a proportional progress bar.
 *
 * Color:
 *   - Info-blue when incomplete (< 100%)
 *   - Success-green when 100%
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §9.2 "Progress bar"
 */

interface AssignmentProgressProps {
  assigned: number;
  total: number;
}

export function AssignmentProgress({ assigned, total }: AssignmentProgressProps) {
  const pct = total === 0 ? 100 : Math.round((assigned / total) * 100);
  const complete = pct >= 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {assigned} of {total} months assigned
        </span>
        <span
          className={
            complete
              ? 'font-medium text-green-600 dark:text-green-400'
              : 'font-medium text-blue-600 dark:text-blue-400'
          }
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            complete
              ? 'bg-green-500 dark:bg-green-400'
              : 'bg-blue-500 dark:bg-blue-400'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
