/**
 * v5 B2 — Simulator permission helpers (barrel export).
 */

export { useTier3 } from './useTier3';
export { useCanPromote } from './useCanPromote';
export { useCanApplyToForecast } from './useCanApplyToForecast';
export { useCanCreateScenario } from './useCanCreateScenario';
export {
  effectiveCcScope,
  filterProjectsForCcOwner,
  filterLeversForCcOwner,
} from './ccOwnerScope';
export type { CcOwnerScopeContext } from './ccOwnerScope';
