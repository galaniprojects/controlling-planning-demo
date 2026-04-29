/**
 * PipelineStageBadge — consistent stage colour + label for v5 [A-PS-01..13].
 *
 * Used everywhere a project's pipeline stage is shown: backlog detail header,
 * workbench workspace header, portfolio tree, intake queue, and the Run
 * Portfolio entity list (when the entity is a Project).
 *
 * Renders nothing when the stage is null (legacy v4 projects pre-migration).
 */

import { cn } from '@/lib/utils';
import {
  PIPELINE_STAGE_BADGE_CLASS,
  type PipelineStage,
} from '@/lib/pipelineStages';

interface Props {
  stage: PipelineStage | string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function PipelineStageBadge({ stage, size = 'sm', className }: Props) {
  if (!stage) return null;
  const colour =
    (PIPELINE_STAGE_BADGE_CLASS as Record<string, string>)[stage] ??
    'bg-muted text-muted-foreground';
  const sizing =
    size === 'md'
      ? 'px-2.5 py-0.5 text-xs'
      : 'px-2 py-0.5 text-[11px]';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        sizing,
        colour,
        className,
      )}
    >
      {stage}
    </span>
  );
}
