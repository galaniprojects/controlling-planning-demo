/**
 * v5 B2 — Project-level catalogue action: ChangeExternalRate.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `change-external-rate`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const ChangeExternalRateAction = makeCatalogueWrapper('change-external-rate');
