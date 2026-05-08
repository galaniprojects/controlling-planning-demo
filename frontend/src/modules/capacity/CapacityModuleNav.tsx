/**
 * CapacityModuleNav — secondary nav strip for the capacity module
 * (v5.2 Wave 2, Track B).
 *
 * Renders below the page title and above the scope bar within the
 * `CapacityManagement` layout shell. Provides three top-level routes:
 *
 *   Workspace    Requests (N)    History
 *
 * Per spec §12.1, role visibility is:
 *
 * | Route     | Controller | CC Owner | Executive | PL  |
 * | --------- | ---------- | -------- | --------- | --- |
 * | Workspace | ✅          | ✅        | ✅         | ❌   |
 * | Requests  | ✅          | ✅        | ❌         | ❌   |
 * | History   | ✅          | ✅        | ✅         | ❌   |
 *
 * Hidden routes do not render their nav link. PLs do not see this nav
 * at all (they're routed to `/capacity/availability`, which uses its
 * own page chrome).
 *
 * The "Requests" badge count is sourced from the parent layout shell
 * via the `pendingRequestCount` prop (`CapacityContext.pending_request_count`).
 * The real API field is already populated by Wave 1 backend foundation;
 * the dashboard KPI card from spec §5.2 will share the same source in
 * Wave 3. Badge is hidden when count is 0 (per spec §12.1).
 */
import { NavLink } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { cn } from '@/lib/utils';

interface CapacityModuleNavProps {
  /**
   * Pending request count to render in the Requests badge. Falsy or
   * zero hides the badge per spec §12.1. Defaults to 0 so callers may
   * omit the prop while the data layer is being wired up.
   */
  pendingRequestCount?: number;
}

interface NavItem {
  to: string;
  label: string;
  /** Optional badge count rendered next to the label. Hidden if 0. */
  badgeCount?: number;
  /** Roles for which this link should render. */
  visibleTo: ReadonlyArray<'controller' | 'cost_center_owner' | 'executive'>;
  /**
   * Force exact-match for the active state. We only want `/capacity`
   * highlighted when the path is exactly `/capacity`, not when nested
   * under `/capacity/requests` or `/capacity/history`.
   */
  end?: boolean;
}

export default function CapacityModuleNav({
  pendingRequestCount = 0,
}: CapacityModuleNavProps = {}) {
  const { context } = useRole();
  const role = context?.role;

  // PLs land on /capacity/availability and never see this nav.
  if (role !== 'controller' && role !== 'cost_center_owner' && role !== 'executive') {
    return null;
  }

  const items: NavItem[] = [
    {
      to: '/capacity',
      label: 'Workspace',
      visibleTo: ['controller', 'cost_center_owner', 'executive'],
      end: true,
    },
    {
      to: '/capacity/requests',
      label: 'Requests',
      badgeCount: pendingRequestCount,
      visibleTo: ['controller', 'cost_center_owner'],
    },
    {
      to: '/capacity/history',
      label: 'History',
      visibleTo: ['controller', 'cost_center_owner', 'executive'],
    },
  ];

  const visible = items.filter((it) =>
    (it.visibleTo as ReadonlyArray<string>).includes(role),
  );

  return (
    <nav
      aria-label="Capacity module sections"
      className="flex items-center gap-1 border-b border-border"
    >
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'border-b-2 -mb-px',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )
          }
        >
          <span>{item.label}</span>
          {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full',
                'text-xs font-medium',
                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              )}
              aria-label={`${item.badgeCount} pending`}
            >
              {item.badgeCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
