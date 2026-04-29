/**
 * v5 B2 — Portfolio-rule catalogue action: FreezeNewStarts.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `freeze-new-starts`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const FreezeNewStartsAction = makeCatalogueWrapper('freeze-new-starts');
