/**
 * ConfidenceIndicator — distinct-shape confidence dot per `[E-07g]`.
 *
 * Renders a diamond (rotated square) in green / amber / red so it can
 * sit next to the regular RAG dot vocabulary without confusion. Used by
 * the Workbench Overview Progress Tracker tile, Launchpad pending-action
 * cards, and any other surface that displays "next milestone confidence".
 *
 * The diamond shape is a deliberate, spec-mandated departure from the
 * RAG circle to let both indicators coexist on the same card (e.g. a
 * tile with project health RAG + progress confidence).
 */
import { cn } from '@/lib/utils';

export type ConfidenceLevel = 'on_track' | 'at_risk' | 'blocked';

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  blocked: 'Blocked',
};

const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  on_track: 'fill-green-500 stroke-green-600',
  at_risk: 'fill-amber-500 stroke-amber-600',
  blocked: 'fill-red-500 stroke-red-600',
};

export interface ConfidenceIndicatorProps {
  level: ConfidenceLevel;
  /** Square size in pixels (default 14). */
  size?: number;
  className?: string;
  /** Override the default ARIA label. */
  ariaLabel?: string;
}

export function ConfidenceIndicator({
  level,
  size = 14,
  className,
  ariaLabel,
}: ConfidenceIndicatorProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel ?? `Confidence: ${CONFIDENCE_LABEL[level]}`}
      className={cn('flex-shrink-0', className)}
    >
      <polygon
        points={points}
        className={cn('stroke-2', CONFIDENCE_COLOR[level])}
      />
    </svg>
  );
}
