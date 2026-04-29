/**
 * v5 B2 — Project-level catalogue action: DelayProject.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `delay-project`).
 */

import { makeCatalogueWrapper } from '../wrapper';

export const DelayProjectAction = makeCatalogueWrapper('delay-project');
