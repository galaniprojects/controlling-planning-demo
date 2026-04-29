/**
 * v5 B2 — `useScenarioContext` consumer hook.
 *
 * Throws if invoked outside `<ScenarioProvider>` so misuse is loud.
 * Surfaces, the catalogue, the impact dashboard, and the drawer all
 * call this hook — never `useContext(ScenarioCtx)` directly.
 */

import { useScenarioContextRaw, type ScenarioContextValue } from './ScenarioContext';

export function useScenarioContext(): ScenarioContextValue {
  const ctx = useScenarioContextRaw();
  if (!ctx) {
    throw new Error('useScenarioContext must be used inside <ScenarioProvider>');
  }
  return ctx;
}

export type { ScenarioContextValue };
