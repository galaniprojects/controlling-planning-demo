/**
 * CapacityPanelContent — v5.2 W3 Track C.
 *
 * Thin dispatcher passed once to the shared `SidePanel` via
 * `openPanel(...)`. Reads the current `mode` from
 * `CapacitySidePanelContext` and renders the matching detail surface.
 *
 * Why a dispatcher (and not pass `<PersonDetail />` directly)?
 *
 *   - Avoids a circular import between `CapacitySidePanelContext` and
 *     the detail components.
 *   - Lets the panel content respond to mode changes (Person → Cell)
 *     without the caller of `openPanel` having to rebuild a node.
 *   - Mode-switch cross-fade (§7.4) can be handled inside the detail
 *     components by keying their outer wrapper on the mode payload —
 *     React unmounts the old wrapper subtree and mounts the new one,
 *     triggering the `animate-in fade-in-0 duration-200` animation.
 *
 * `project_summary` and `assignment` content is owned by Track A
 * (W4 §9 and §6a respectively); until those tracks land we render an
 * informative stub. Track A does not need to modify this file —
 * `openProjectSummary` / `openAssignment` route through the handler
 * registry on `CapacitySidePanelContext` instead.
 */
import { useCapacitySidePanel } from './CapacitySidePanelContext';
import { CellDetail } from './CellDetail';
import { PersonDetail } from './PersonDetail';

export function CapacityPanelContent() {
  const { mode } = useCapacitySidePanel();

  if (!mode) {
    // The shared SidePanel is open but our context has no active mode —
    // shouldn't happen in normal flow (open* always sets mode first),
    // but stay defensive: render nothing rather than crashing.
    return null;
  }

  switch (mode.kind) {
    case 'person':
      return <PersonDetail ccId={mode.ccId} personId={mode.personId} />;
    case 'cell':
      return (
        <CellDetail
          dimensionId={mode.dimensionId}
          pivot={mode.pivot}
          month={mode.month}
          rowLabel={mode.rowLabel}
        />
      );
    case 'project_summary':
    case 'assignment':
      // These modes render content owned by Track A (W4 §6a, §9).
      // Until those tracks land, the open* methods stay in their no-op
      // stub form and never set mode to one of these kinds — so this
      // branch is unreachable in W3. We render a stub so the UI is at
      // least informative if a developer drives the state directly.
      return (
        <p className="text-xs text-muted-foreground">
          {mode.kind === 'assignment'
            ? 'Assignment panel content lands in Wave 4 (Session 6a).'
            : 'Project summary content lands in Wave 4 (Session 9).'}
        </p>
      );
  }
}
