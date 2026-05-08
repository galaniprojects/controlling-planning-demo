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
 * The detail components themselves (`PersonDetail`, `CellDetail`,
 * etc.) are wired into the switch statement as they land in their
 * respective commits within Track C / later sessions.
 */
import { useCapacitySidePanel } from './CapacitySidePanelContext';

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
      // PersonDetail content lands in the next commit.
      return (
        <p className="text-xs text-muted-foreground">
          Person detail loading…
        </p>
      );
    case 'cell':
      // CellDetail content lands in the next commit.
      return (
        <p className="text-xs text-muted-foreground">
          Cell detail loading…
        </p>
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
