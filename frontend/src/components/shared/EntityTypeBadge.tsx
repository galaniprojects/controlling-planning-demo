/**
 * EntityTypeBadge — colour-coded badge for the three ChargeableEntity
 * subtypes (Project / Offering / InternalService).
 *
 * Codifies the colour vocabulary the FD-6 admin panel established
 * (blue / purple / amber) so the Workbench sidebar, service tile grid,
 * Allocation Flow nodes (Session 4), and Distribution Editor candidate
 * picker (Session 5) share one source of truth.
 *
 * Variants:
 *  - "solid" (default) — pill-shaped Badge with subtype-coloured fill,
 *    matching the FD-6 panel rows. Used in tables, sidebars, anywhere
 *    a status-style indicator is wanted.
 *  - "strip" — vertical accent strip + label, used by Allocation Flow
 *    EntityNode (Session 4) and the Distribution Editor table
 *    destination column (Session 5). Width / position is owned by the
 *    consumer; this component just emits the strip + label as flex
 *    children.
 */
import type { ChargeableEntityType } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SUBTYPE_LABEL: Record<ChargeableEntityType, string> = {
  Project: 'Project',
  Offering: 'Offering',
  InternalService: 'Internal Service',
};

/**
 * Solid badge classes. Matches the FD-6 admin panel exactly so the
 * Chargeable Entities admin row, the Workbench sidebar item, and the
 * service tile grid header all use the same colour for a given subtype.
 */
const SUBTYPE_BADGE_CLASS: Record<ChargeableEntityType, string> = {
  Project:
    'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
  Offering:
    'bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400',
  InternalService:
    'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',
};

interface Props {
  type: ChargeableEntityType;
  /** Override the label text — defaults to the human-readable subtype. */
  label?: string;
  className?: string;
}

export function EntityTypeBadge({ type, label, className }: Props) {
  return (
    <Badge
      className={cn(
        'text-[10px] px-1.5 py-0 h-4 font-medium',
        SUBTYPE_BADGE_CLASS[type],
        className,
      )}
    >
      {label ?? SUBTYPE_LABEL[type]}
    </Badge>
  );
}

export function entityTypeLabel(type: ChargeableEntityType): string {
  return SUBTYPE_LABEL[type];
}

/** Subtype → solid-fill className. Re-exported for callers that need it. */
export const entityTypeBadgeClass = (type: ChargeableEntityType): string =>
  SUBTYPE_BADGE_CLASS[type];
