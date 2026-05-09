/**
 * DashboardLayer — v5.2 W4 Track B (§11).
 *
 * Collapsible dashboard section positioned between KPISummaryBar and
 * FilterChipBar in CapacityWorkspace. Contains four cards in a 2x2 grid:
 *
 *   1. UtilizationDistributionCard (§11.3) — histogram of people by avg util
 *   2. CapacityForecastCard       (§11.4) — area chart: available/allocated/demand
 *   3. HeadcountBreakdownCard     (§11.5) — segmented bar with dimension switcher
 *   4. HotspotListCard            (§11.6) — ranked list of top capacity issues
 *
 * Visibility rules (§11.1):
 *   - Shown only for Controller or Executive roles.
 *   - Hidden when scope is `my_cc` (single-CC). Slide-up animation on hide.
 *
 * Collapse state persisted in localStorage: `creta_capacity_dashboard_collapsed`.
 * Default: expanded on first visit.
 *
 * Spec: guides/Capacity_Module_Redesign_Spec.md §11.1–§11.9
 */
import { useEffect, useRef, useState } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { useCapacityScope } from '@/contexts/CapacityScopeContext';
import { DashboardToggle } from './DashboardToggle';
import { UtilizationDistributionCard } from './UtilizationDistributionCard';
import { CapacityForecastCard } from './CapacityForecastCard';
import { HeadcountBreakdownCard } from './HeadcountBreakdownCard';
import { HotspotListCard } from './HotspotListCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_COLLAPSE_KEY = 'creta_capacity_dashboard_collapsed';

/**
 * Roles that are permitted to see the dashboard layer.
 * Maps to `context.role` values from RoleContext.
 */
const ALLOWED_ROLES = new Set(['controller', 'executive']);

/**
 * Scope kinds that are considered "multi-CC" (dashboard visible).
 * `my_cc` is the single-CC scope that hides the dashboard.
 */
const MULTI_CC_SCOPES = new Set(['all_ccs', 'location', 'hierarchy']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardLayer() {
  const { context } = useRole();
  const { scope } = useCapacityScope();

  // Visibility gate: role AND scope check.
  const role = context?.role ?? '';
  const isRoleAllowed = ALLOWED_ROLES.has(role);
  const isScopeMultiCC = MULTI_CC_SCOPES.has(scope.kind);
  const shouldShow = isRoleAllowed && isScopeMultiCC;

  // Collapse state — persisted in localStorage.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(LS_COLLAPSE_KEY);
    // Default: expanded (not collapsed) on first visit.
    return stored === 'true';
  });

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_COLLAPSE_KEY, String(next));
      return next;
    });
  };

  // Slide-up animation via max-height CSS transition.
  // We track the visible state separately so the DOM exits cleanly.
  const [visible, setVisible] = useState(shouldShow);
  const animatingRef = useRef(false);

  useEffect(() => {
    if (shouldShow) {
      setVisible(true);
      animatingRef.current = false;
    } else {
      // Trigger slide-up: set to invisible after the transition ends.
      // We let CSS handle the animation; no framer-motion needed.
      animatingRef.current = true;
      // After 320ms (max-height transition), fully hide from layout.
      const t = setTimeout(() => {
        setVisible(false);
        animatingRef.current = false;
      }, 320);
      return () => clearTimeout(t);
    }
  }, [shouldShow]);

  if (!visible && !shouldShow) return null;

  return (
    <div
      // v5.2 W6 Track B (#8.3) — outer slide-up uses 720px max so the
      // single-column responsive grid (~640px) is not clipped on
      // viewports < 900px tall. Tall screens render the 2-col layout
      // and stay well under 400px naturally.
      className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
      style={{
        maxHeight: shouldShow ? '720px' : '0px',
        opacity: shouldShow ? 1 : 0,
      }}
    >
      {/* Toggle header */}
      <div className="mb-2 flex items-center">
        <DashboardToggle collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* Card grid — hidden when collapsed.
          v5.2 W6 Track B (#8.3) — the previous flat 320px max-height
          clipped the bottom row of cards on viewports under ~900px high
          (≈laptop screens). The arbitrary height-media-query variant
          keeps the 320px clip on tall screens (where it serves as a
          compact-mode hint) but lets the grid grow to its natural height
          on shorter screens. The `data-[collapsed]` driven force-class
          still animates the slide-up on toggle in both modes. */}
      <div
        data-collapsed={collapsed ? 'true' : 'false'}
        className={
          'overflow-hidden transition-[max-height] duration-200 ease-in-out ' +
          // collapsed → 0; expanded → unbounded on short screens, 320px
          // on tall screens. `[@media(min-height:900px)]` is a Tailwind
          // arbitrary variant that emits a `@media (min-height: 900px)`
          // query — exactly the height-based gate the brief asks for.
          'data-[collapsed=true]:!max-h-0 ' +
          'max-h-none [@media(min-height:900px)]:max-h-[320px]'
        }
      >
        <div className="grid gap-3 pb-1 grid-cols-1 lg:grid-cols-2">
          {/* Top-left: Utilization distribution */}
          <div className="rounded-lg border border-border bg-card p-4">
            <UtilizationDistributionCard />
          </div>

          {/* Top-right: Capacity forecast */}
          <div className="rounded-lg border border-border bg-card p-4">
            <CapacityForecastCard />
          </div>

          {/* Bottom-left: Headcount breakdown */}
          <div className="rounded-lg border border-border bg-card p-4">
            <HeadcountBreakdownCard />
          </div>

          {/* Bottom-right: Hotspot list */}
          <div className="rounded-lg border border-border bg-card p-4">
            <HotspotListCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayer;
