/**
 * v5 B2 — Project-level catalogue action: CloneProject.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `clone-project`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const CloneProjectAction = makeCatalogueWrapper('clone-project');
