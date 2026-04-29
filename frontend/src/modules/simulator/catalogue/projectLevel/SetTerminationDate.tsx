/**
 * v5 B2 — Project-level catalogue action: SetTerminationDate.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `set-termination-date`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const SetTerminationDateAction = makeCatalogueWrapper('set-termination-date');
