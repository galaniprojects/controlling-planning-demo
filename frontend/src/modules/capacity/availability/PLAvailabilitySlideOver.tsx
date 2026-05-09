/**
 * PLAvailabilitySlideOver — v5.2 W6 Track B (S11 §13.9)
 *
 * Wraps {@link PLAvailabilityView} in slide-over mode for use inside the
 * shared {@link WideSlideOver}. The Workbench Forecast & Planning tab
 * opens this via `useWideSlideOver().openSlideOver(...)`.
 *
 * Behaviour (spec §13.9):
 *   - 50vw panel sliding from the right (handled by WideSlideOver).
 *   - Workbench remains visible behind a dimmed backdrop.
 *   - PL can browse role/location availability without leaving the
 *     Workbench context.
 *   - "Request this role" inside the panel closes the slide-over and
 *     fires `onRequestRole(slot)` so the host (ForecastTab) can populate
 *     the F&P row with role/location/period.
 *   - Dismissal via × / Escape / backdrop click does nothing extra
 *     (the panel just closes; no callback fired).
 *
 * Reuses every piece of the standalone view (scope bar, KPIs, grid, side
 * panel content) — no duplication. The only behavioural difference is the
 * mode prop on PLAvailabilityView, which:
 *   - Hides the page-level ModuleHeader.
 *   - Skips URL sync of filters (slide-over is ephemeral).
 *   - Renders the side panel inline beneath the grid (no panel-within-
 *     panel — the wide slide-over has no room for a 280px child).
 */
import PLAvailabilityView, {
  type RequestedRoleSlot,
} from '@/modules/capacity/PLAvailabilityView';

export interface PLAvailabilitySlideOverProps {
  /** Pre-selected location for the wide slide-over (defaults to All). */
  initialLocationId?: string | null;
  /** Pre-selected role types (filter chips). */
  initialRoleIds?: string[];
  /**
   * Invoked when the PL clicks "Request this role" inside the panel.
   * The wrapper (or host) is responsible for closing the slide-over.
   */
  onRequestRole: (slot: RequestedRoleSlot) => void;
}

export default function PLAvailabilitySlideOver({
  initialLocationId = null,
  initialRoleIds = [],
  onRequestRole,
}: PLAvailabilitySlideOverProps) {
  return (
    <PLAvailabilityView
      mode="slideover"
      initialLocationId={initialLocationId}
      initialRoleIds={initialRoleIds}
      onRequestRole={onRequestRole}
    />
  );
}
