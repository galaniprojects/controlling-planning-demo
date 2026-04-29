/**
 * v5 B2 — Project-level catalogue actions (10).
 *
 * Each component is a thin wrapper around `ActionForm` bound to the
 * matching `ActionDefinition` from `catalogueDef.ts`. They exist as
 * named React components so that:
 *  - Deep-linking via `/simulator/scenarios/:id/action/:actionId` can
 *    render a specific surface directly (lazy-loaded).
 *  - Per-action customisation hooks (e.g. extra headline metrics) can
 *    be attached without bloating the shared form.
 */

export { RemoveProjectAction } from './RemoveProject';
export { PauseProjectAction } from './PauseProject';
export { DelayProjectAction } from './DelayProject';
export { AccelerateProjectAction } from './AccelerateProject';
export { ScaleBudgetAction } from './ScaleBudget';
export { ChangeSourcingMixAction } from './ChangeSourcingMix';
export { SetTerminationDateAction } from './SetTerminationDate';
export { CloneProjectAction } from './CloneProject';
export { AdjustVendorContractAction } from './AdjustVendorContract';
export { ChangeExternalRateAction } from './ChangeExternalRate';
