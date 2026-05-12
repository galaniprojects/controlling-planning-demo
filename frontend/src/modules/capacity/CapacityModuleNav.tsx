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
 * The "Requests" badge count comes from the W3 KPI bar via the
 * `pendingRequestsKpi` slot on `CapacityScopeContext` (Lead 0.4 seam) so
 * the same number renders in two places without a duplicate fetch. When
 * the KPI bar hasn't published a value yet (or the user is on a route
 * outside the scope provider — e.g., `/capacity/availability` for PL),
 * the layout falls back to the `pendingRequestCount` prop sourced from
 * `CapacityContext.pending_request_count`. Badge is hidden when count is 0
 * (per spec §12.1).
 */
import { NavLink } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { useCapacityScopeOptional } from '@/contexts/CapacityScopeContext';
import { cn } from '@/lib/utils';

interface CapacityModuleNavProps {
  /**
   * Fallback pending request count used when the scope provider isn't
   * mounted (e.g., the layout shell wraps `/capacity/availability` for
   * PLs). The W3 KPI bar wins when both are present. Defaults to 0.
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

  // Read the live KPI value when we're inside the CapacityScopeProvider;
  // outside it (e.g., PL availability route) the hook returns null and
  // we fall back to the prop sourced from CapacityContext.
  const scopeContext = useCapacityScopeOptional();
  const liveBadgeCount = scopeContext?.pendingRequestsKpi;
  const badgeCount =
    typeof liveBadgeCount === 'number' ? liveBadgeCount : pendingRequestCount;

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
      badgeCount,
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
