/**
 * LeftRailNav — shared left-rail navigation per `[E-07c]`.
 *
 * Standardises the three custom left navs found in the v5 Session E8
 * audit: Charging `ChargingSidebar`, Admin `EntitySelector`, and the
 * Workbench `ProjectListPanel` inner list. Mirrors the Cluster D Admin
 * treatment: 240–260px width, `bg-card`-style surface, items
 * `px-3 py-2 rounded-md`, active state `bg-primary/5 text-primary
 * font-medium border-l-2 border-primary pl-2.5`.
 *
 * Two prop forms:
 *   - flat:    `<LeftRailNav items={...} activeId=... onSelect={...} />`
 *   - grouped: `<LeftRailNav groups={[{ label, items: [...] }, ...]} ... />`
 *
 * Items support an optional one-line description (used by Charging's
 * surface descriptions) and optional badge / icon. The component is
 * presentational — call sites own state, search, and filtering.
 */
import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface LeftRailNavItem {
  /** Stable identifier — passed back via `onSelect`. */
  id: string;
  /** Primary label rendered to the user. */
  label: ReactNode;
  /** Optional Lucide icon component. */
  icon?: React.ElementType;
  /** Optional one-line description below the label. */
  description?: ReactNode;
  /** Optional right-aligned badge / count. */
  badge?: ReactNode;
  /** Disable interaction. */
  disabled?: boolean;
}

export interface LeftRailNavGroup {
  /** Section heading (uppercase muted label). */
  label: ReactNode;
  /** Items inside this group. */
  items: LeftRailNavItem[];
}

interface BaseProps {
  /** Currently selected item id (matches one of the items[].id values). */
  activeId: string | null;
  /** Selection callback. */
  onSelect: (id: string) => void;
  /** Outer width — defaults to 240px. */
  width?: number;
  /** ARIA label for the nav element. */
  ariaLabel?: string;
  /** Extra className passed through. */
  className?: string;
}

interface FlatProps extends BaseProps {
  items: LeftRailNavItem[];
  groups?: never;
}

interface GroupedProps extends BaseProps {
  groups: LeftRailNavGroup[];
  items?: never;
}

export type LeftRailNavProps = FlatProps | GroupedProps;

export function LeftRailNav(props: LeftRailNavProps) {
  const {
    activeId,
    onSelect,
    width = 240,
    ariaLabel,
    className,
  } = props;

  const renderItem = (item: LeftRailNavItem) => {
    const Icon = item.icon;
    const isActive = activeId === item.id;
    const hasDescription = item.description !== undefined && item.description !== null;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => !item.disabled && onSelect(item.id)}
        disabled={item.disabled}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex w-full items-start text-sm rounded-md transition-colors text-left',
          hasDescription
            ? 'flex-col px-3 py-2 gap-0.5'
            : 'items-center gap-2.5 px-3 py-2',
          isActive
            ? 'bg-primary/5 text-primary font-medium border-l-2 border-primary pl-2.5'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          item.disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        )}
      >
        {hasDescription ? (
          <>
            <span className="flex items-center gap-2.5 w-full">
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="truncate flex-1">{item.label}</span>
              {item.badge && <span className="flex-shrink-0">{item.badge}</span>}
            </span>
            <span
              className={cn(
                'text-[11px] leading-tight pl-[26px]',
                isActive
                  ? 'text-primary/70'
                  : 'text-muted-foreground/70',
              )}
            >
              {item.description}
            </span>
          </>
        ) : (
          <>
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="truncate flex-1">{item.label}</span>
            {item.badge && <span className="flex-shrink-0">{item.badge}</span>}
          </>
        )}
      </button>
    );
  };

  const renderGroup = (group: LeftRailNavGroup, index: number) => (
    <div key={typeof group.label === 'string' ? group.label : index}>
      {index > 0 && <Separator className="my-2" />}
      <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 mt-2">
        {group.label}
      </p>
      {group.items.map(renderItem)}
    </div>
  );

  return (
    <nav
      aria-label={ariaLabel}
      style={{ width }}
      className={cn(
        'shrink-0 space-y-0.5 overflow-y-auto pr-1',
        className,
      )}
    >
      {'groups' in props && props.groups
        ? props.groups.map(renderGroup)
        : 'items' in props && props.items
          ? props.items.map(renderItem)
          : null}
    </nav>
  );
}
