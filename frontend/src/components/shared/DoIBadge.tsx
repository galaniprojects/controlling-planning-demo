/**
 * DoIBadge — Degree of Integration indicator [A-DOI-01..11].
 *
 * Renders "DoI {n}" with macro-phase tinting. Off-path projects (Paused /
 * Cancelled) use ``frozenDoi`` which is rendered with a slash and a muted
 * tone to convey that the level is locked.
 *
 * Renders nothing when both ``doi`` and ``frozenDoi`` are null (rare; only
 * pre-v5 rows that haven't been backfilled yet).
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  DOI_BADGE_CLASS,
  DOI_LEVEL_LABEL,
  doiMacroPhase,
} from '@/lib/pipelineStages';

interface Props {
  doi: number | null | undefined;
  frozenDoi?: number | null;
  size?: 'sm' | 'md';
  showPhase?: boolean;
  className?: string;
}

export function DoIBadge({
  doi,
  frozenDoi,
  size = 'sm',
  showPhase = false,
  className,
}: Props) {
  const live = doi ?? null;
  const frozen = frozenDoi ?? null;
  const value = live !== null ? live : frozen;
  if (value === null || value === undefined) return null;

  const phase = doiMacroPhase(value);
  const label = DOI_LEVEL_LABEL[value] ?? '';
  const colour =
    DOI_BADGE_CLASS[value] ?? 'bg-muted text-muted-foreground';
  const sizing =
    size === 'md'
      ? 'px-2.5 py-0.5 text-xs'
      : 'px-2 py-0.5 text-[11px]';

  const isFrozen = live === null && frozen !== null;
  const display = isFrozen ? `DoI ${frozen}*` : `DoI ${value}`;

  const tooltipText = [
    `DoI ${value} — ${label}`,
    phase ? `Phase: ${phase}` : null,
    isFrozen ? 'Frozen — project is off-path (Paused or Cancelled)' : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
            sizing,
            isFrozen ? 'bg-muted text-muted-foreground' : colour,
            className,
          )}
        >
          {display}
          {showPhase && phase ? (
            <span className="opacity-70">· {phase}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="whitespace-pre-line">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
