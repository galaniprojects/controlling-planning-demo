/**
 * v5 B2 — Project-level catalogue action: RemoveProject.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `remove-project`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const RemoveProjectAction = makeCatalogueWrapper('remove-project');
