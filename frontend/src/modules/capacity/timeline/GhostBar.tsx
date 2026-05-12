/**
 * GhostBar — v5.2 W5 Track B (spec §10.5).
 *
 * Dashed-border bar for unfulfilled-request rows. Visual language matches
 * the assignment-mode ghost segments (§9.4) but here ghosts are always
 * visible (no assignment mode required).
 *
 * For partially-fulfilled months, the bar is split: solid portion
 * (assigned hours) + dashed portion (remaining). Mirrors the
 * project-row's fulfillment-bar decomposition.
 */
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';

export interface GhostBarProps {
  /** Project id — same color as the project's other segments. */
  projectId: string;
  /** Total requested hours for the period. */
  requestedHours: number;
  /** Hours already assigned (may be 0 for fully-pending). */
  assignedHours: number;
  /** Reference maximum hours across visible projects (for width scaling). */
  referenceMaxHours: number;
  /** Period label for tooltip — e.g., "Apr 2026". */
  contextLabel: string;
  /** Role name for tooltip context (e.g., "Senior Developer"). */
  roleName: string;
}

export function GhostBar({
  projectId,
  requestedHours,
  assignedHours,
  referenceMaxHours,
  contextLabel,
  roleName,
}: GhostBarProps) {
  const color = useProjectColor(projectId);

  if (requestedHours <= 0) {
    return <div className="h-3 w-full rounded-[2px] bg-transparent" />;
  }

  const cappedAssigned = Math.min(assignedHours, requestedHours);
  const remaining = Math.max(0, requestedHours - cappedAssigned);

  // Total bar width relative to reference maximum.
  const totalPct = referenceMaxHours > 0
    ? Math.min(100, (requestedHours / referenceMaxHours) * 100)
    : 0;
  const solidPctOfTotal = requestedHours > 0
    ? (cappedAssigned / requestedHours) * 100
    : 0;
  const dashedPctOfTotal = 100 - solidPctOfTotal;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex h-3 rounded-[2px] overflow-hidden"
          style={{ width: `${totalPct}%` }}
          aria-label={`${roleName} demand: ${remaining.toFixed(0)}h unassigned of ${requestedHours.toFixed(0)}h`}
        >
          {solidPctOfTotal > 0 && (
            <div
              className="h-full"
              style={{
                width: `${solidPctOfTotal}%`,
                backgroundColor: color,
              }}
            />
          )}
          {dashedPctOfTotal > 0 && (
            <div
              className="h-full"
              style={{
                width: `${dashedPctOfTotal}%`,
                // Dashed-border + 25% opacity fill (spec §10.5).
                backgroundColor: color,
                opacity: 0.25,
                border: `1.5px dashed ${color}`,
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">{roleName}</div>
        <div className="text-[11px] opacity-90">
          {contextLabel} — {requestedHours.toFixed(0)}h requested
          {cappedAssigned > 0 ? `, ${cappedAssigned.toFixed(0)}h assigned, ` : ', '}
          {remaining.toFixed(0)}h unassigned
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
