/**
 * FulfillmentBar — v5.2 W5 Track B (spec §10.3).
 *
 * Renders the project-group "fulfillment bar" inside one bar cell:
 *
 *   - Solid fill   = assigned hours / referenceMaxHours.
 *   - Dashed tail  = (requested − assigned) / referenceMaxHours, the
 *                    unfulfilled remainder, drawn with a 25%-opacity
 *                    project-color fill and a dashed border.
 *   - Empty        = no requested hours for this period.
 *
 * The total bar width (solid + dashed) represents the total requested
 * hours relative to the **reference maximum** (the highest total-
 * requested-hours single month across all visible projects). This keeps
 * bars comparable across projects per §10.3 "ensures the bars are
 * comparable across projects".
 */
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectColor } from '@/contexts/ProjectColorMapContext';

export interface FulfillmentBarProps {
  /** Stable project id — drives color via `useProjectColor`. */
  projectId: string;
  /** Total requested hours for the period (single month, or sum for collapsed quarter/year). */
  requestedHours: number;
  /** Hours fulfilled (assigned) for the period. Capped at requestedHours by caller. */
  assignedHours: number;
  /** Reference maximum hours across all visible projects (for width scaling). */
  referenceMaxHours: number;
  /** Period context label for tooltip — e.g., "Apr 2026", "Q3 2026 sum". */
  contextLabel: string;
  /** Lower opacity on collapsed-period bars (mirrors §4.4). */
  isSummary?: boolean;
}

export function FulfillmentBar({
  projectId,
  requestedHours,
  assignedHours,
  referenceMaxHours,
  contextLabel,
  isSummary = false,
}: FulfillmentBarProps) {
  const color = useProjectColor(projectId);
  // Empty cell — nothing requested. Render a faint placeholder so the
  // grid stays aligned but no bar shows.
  if (requestedHours <= 0) {
    return <div className="h-3 w-full rounded-[2px] bg-transparent" />;
  }

  const cappedAssigned = Math.min(assignedHours, requestedHours);
  const remaining = Math.max(0, requestedHours - cappedAssigned);

  // Normalise widths against referenceMaxHours so bars compare across
  // projects. Cap at 100% to keep the bar inside the cell width.
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
          className={cn(
            'flex h-3 rounded-[2px] overflow-hidden',
            'bg-transparent',
          )}
          style={{
            width: `${totalPct}%`,
            opacity: isSummary ? 0.85 : 1,
          }}
          aria-label={`Fulfillment: ${cappedAssigned.toFixed(0)}h of ${requestedHours.toFixed(0)}h (${(solidPctOfTotal).toFixed(0)}%)`}
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
                // Spec §10.3: 25% opacity fill + dashed border on the unfulfilled tail.
                backgroundColor: color,
                opacity: 0.25,
                borderTop: `1px dashed ${color}`,
                borderBottom: `1px dashed ${color}`,
                borderRight: `1px dashed ${color}`,
                // No left border so it visually flows from the solid segment.
              }}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">
          {cappedAssigned.toFixed(0)}h of {requestedHours.toFixed(0)}h
        </div>
        <div className="text-[11px] opacity-90">
          {contextLabel} — {remaining > 0
            ? `${remaining.toFixed(0)}h unassigned (${(dashedPctOfTotal).toFixed(0)}%)`
            : 'fully assigned'}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
