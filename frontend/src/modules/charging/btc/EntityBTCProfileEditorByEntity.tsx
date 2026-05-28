/**
 * EntityBTCProfileEditorByEntity — entity-keyed mount wrapper around
 * `EntityBTCProfileEditor`.
 *
 * Service Workbench Wave C deep-link entry point. When the user clicks
 * the Workbench tile 2,2 ("Stage 2 BTC"), the URL becomes
 * `/charging?section=btc&entity=<id>` and `BTCProfileListView` mounts
 * this wrapper so the page lands directly in the per-entity BTC editor
 * for the current demo year (2026) — instead of the cross-entity list.
 *
 * `EntityBTCProfileEditor` already supports an entity-keyed mounting
 * form (`{ entityId, year }`) per [E-09] / F6 — including a clean
 * "no profile yet" empty state when the entity has no BTC profile
 * for the requested year. This wrapper just adapts the URL-param
 * shape to that existing API; no new fetch logic.
 *
 * Plan reference: `track-b/let-s-start-working-on-distributed-cosmos.md`
 * §"Track B — Per-entity URL contract for /charging".
 */
import { EntityBTCProfileEditor } from './EntityBTCProfileEditor';

const DEMO_YEAR = 2026;

interface Props {
  entityId: string;
  /**
   * Year of the BTC profile to resolve. Defaults to the demo year
   * (April 2026 per CLAUDE.md). Callers that want to deep-link to a
   * non-current-year profile can override this.
   */
  year?: number;
  onBack: () => void;
}

export function EntityBTCProfileEditorByEntity({ entityId, year = DEMO_YEAR, onBack }: Props) {
  return (
    <EntityBTCProfileEditor
      entityId={entityId}
      year={year}
      onBack={onBack}
    />
  );
}
