/**
 * ScenarioContext consumer hook.
 *
 * ⚠️ MERGE NOTE: T1 (`t1-shell`) is the canonical owner of this file. T3
 * created this minimal stub so the impact dashboard + Compare components
 * could compile and render in isolation while T1 was offline. **At merge
 * time, take T1's version verbatim — keep this file's interface only as a
 * cross-reference for what T3 actually consumes.**
 *
 * The interface below is the *minimum* surface T3 reads. T1's real hook
 * exposes a much wider surface (mutations, lifecycle, etc.); only the
 * read-only fields plus `recalculate()` are referenced from `workspace/impact/`
 * and `compare/`.
 *
 * If T1's version is already in the worktree when this file is touched,
 * delete this stub and the `ScenarioContextProvider` import below — both
 * live in T1's `ScenarioContext.tsx`.
 */

import { useContext, createContext } from 'react';
import type { ImpactDashboardResponse } from './lib/impactTypes';

/**
 * Read-only slice of ScenarioContext consumed by T3's impact + compare UIs.
 * T1's full ScenarioContext satisfies this shape.
 */
export interface ImpactScenarioContextValue {
  scenarioId: number;
  scenarioVersion: string;
  /** Latest impact response (null until first fetch / before recalc). */
  impact: ImpactDashboardResponse | null;
  /** True while a network call is in-flight. */
  loading: boolean;
  /**
   * Stale per spec [B-ID-01] — true when edits have been made since last
   * recalc. Drives the stale indicator on the impact strip.
   */
  stale: boolean;
  /** Anchor forecast-version id (drives Compare "shared anchor" enforcement). */
  anchorVersionId: number | null;
  /**
   * True if the Tier 3 flag is set on the current user. Drives People tile
   * visibility and PeopleDimension rendering. Frontend trusts both this AND
   * `impact.tier3_visible` as a defense-in-depth check.
   */
  tier3Visible: boolean;
  /** Trigger an explicit recalc (POST /:id/recalculate); updates `impact`. */
  recalculate: () => Promise<void>;
}

/**
 * Default value used when no provider is mounted. Components should never
 * see this in production — `ScenarioWorkspacePage` always mounts the
 * provider. We expose it here so unit-test renderers / Storybook can mount
 * components without a backend.
 */
const defaultValue: ImpactScenarioContextValue = {
  scenarioId: 0,
  scenarioVersion: 'scenario-0',
  impact: null,
  loading: false,
  stale: false,
  anchorVersionId: null,
  tier3Visible: false,
  recalculate: async () => undefined,
};

export const ImpactScenarioContext =
  createContext<ImpactScenarioContextValue>(defaultValue);

/**
 * T3-facing hook. T1's full `useScenarioContext()` from `ScenarioContext.tsx`
 * exposes a superset and is the canonical export — at merge time, this hook
 * either delegates to T1's hook or is removed entirely.
 */
export function useScenarioContext(): ImpactScenarioContextValue {
  return useContext(ImpactScenarioContext);
}
