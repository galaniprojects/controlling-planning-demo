/**
 * v5 B2 — Project-level catalogue action: PauseProject.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `pause-project`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const PauseProjectAction = makeCatalogueWrapper('pause-project');
