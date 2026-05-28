/**
 * EntityTypeBadge — colour-coded badge for the three ChargeableEntity
 * subtypes (Project / Offering / InternalService).
 *
 * Codifies the colour vocabulary (blue / teal / violet) per spec §3.2
 * so the Workbench sidebar, service tile grid, Allocation Flow nodes
 * (Session 4), and Distribution Editor candidate picker (Session 5)
 * share one source of truth.
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
 * Solid badge classes. Single source of truth for the subtype palette —
 * the Chargeable Entities admin row, the Workbench sidebar item, the
 * service tile grid header, the Allocation Flow nodes, and the
 * Distribution Editor candidate picker all use the same colour for a
 * given subtype.
 */
const SUBTYPE_BADGE_CLASS: Record<ChargeableEntityType, string> = {
  Project:
    'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
  Offering:
    'bg-teal-100 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400',
  InternalService:
    'bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400',
};

/**
 * Strip-fill classes. Used by surfaces that need a SOLID accent strip
 * (e.g. Allocation Flow EntityNode left edge) rather than the soft-tint
 * badge fill. Saturated `-500` shade reads as a vivid accent against the
 * `bg-card` body in both light and dark modes — no `dark:` variant
 * needed because the mid-tone token holds across themes. Keeps the
 * subtype palette intent (Project=blue, Offering=teal, IS=violet) per
 * spec §3.2 / wave foundation commit.
 */
const SUBTYPE_STRIP_CLASS: Record<ChargeableEntityType, string> = {
  Project: 'bg-blue-500',
  Offering: 'bg-teal-500',
  InternalService: 'bg-violet-500',
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

/**
 * Subtype → solid accent-strip className. Use this for surfaces that
 * need a saturated colour bar (Allocation Flow EntityNode left strip,
 * service tile header rule, etc.) rather than the soft-tint badge.
 *
 * Tokens (per spec §3.2 / S-1 follow-up):
 *  - Project          → `bg-blue-500`
 *  - Offering         → `bg-teal-500`
 *  - InternalService  → `bg-violet-500`
 */
export const entityTypeStripClass = (type: ChargeableEntityType): string =>
  SUBTYPE_STRIP_CLASS[type];
