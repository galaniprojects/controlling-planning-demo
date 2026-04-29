/**
 * v5 B2 — Restructuring (Tier 3) catalogue action: RelocateTeam.
 *
 * Tier 3 only. Filtered out of `visibleActions(false)` so the panel
 * never renders the tile to non-Tier-3 users (hidden DOM, not disabled,
 * per `[B-AC-02]`). Backend redacts and rejects defensively too.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `relocate-team`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const RelocateTeamAction = makeCatalogueWrapper('relocate-team');
