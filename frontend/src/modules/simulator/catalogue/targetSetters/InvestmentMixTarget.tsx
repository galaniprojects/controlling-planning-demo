/**
 * v5 B2 — Target-setter catalogue action: InvestmentMixTarget.
 *
 * Thin wrapper around the shared ActionForm. Definition lives in
 * `catalogueDef.ts` (id: `set-investment-mix-target`). Informational — flagged
 * `leverCategory='other'` so Promote routes to `no_route`.
 */

import { makeCatalogueWrapper } from '../wrapper';

export const InvestmentMixTargetAction = makeCatalogueWrapper('set-investment-mix-target');
