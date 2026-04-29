/**
 * v5 B2 — Portfolio-rule catalogue action: CutByHierarchy.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `cut-by-hierarchy`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const CutByHierarchyAction = makeCatalogueWrapper('cut-by-hierarchy');
