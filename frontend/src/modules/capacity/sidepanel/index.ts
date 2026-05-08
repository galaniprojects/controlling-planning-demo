/**
 * Capacity side-panel barrel — v5.2 W3 Track C.
 *
 * Public surface for the capacity-specific side-panel dispatcher
 * (Session 5a). Wave 3 Tracks A / D and the W4 assignment-panel
 * session import from this module to:
 *
 *   - Mount the provider once per workspace shell
 *     (`<CapacitySidePanelProvider>`).
 *   - Open person / cell / project / assignment detail surfaces from
 *     anywhere inside the workspace (`useCapacitySidePanel()`).
 *   - Plug in the project-summary / assignment renderers when those
 *     sessions land (the registration seam keeps Track C frozen).
 *
 * Detail components (`PersonDetail`, `CellDetail`) are also exported
 * for narrow re-use (e.g., embedding inside the W4 group-by-project
 * panel) — but the canonical entry-point for callers is the hook.
 */
export {
  CapacitySidePanelProvider,
  useCapacitySidePanel,
  type CapacityPanelMode,
  type ProjectSummaryHandler,
  type AssignmentHandler,
} from './CapacitySidePanelContext';

export { CAPACITY_PANEL_WIDTH, type CapacityPanelKind } from './widths';

export { PersonDetail } from './PersonDetail';
export { CellDetail } from './CellDetail';
