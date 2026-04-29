/**
 * v5 B2 — Target-setter catalogue action: OutsourcingTarget.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `set-outsourcing-target`). Informational — flagged
 * `leverCategory='other'` so Promote routes to `no_route`.
 */

import { makeCatalogueWrapper } from '../wrapper';

export const OutsourcingTargetAction = makeCatalogueWrapper('set-outsourcing-target');
