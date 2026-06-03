/**
 * v5 B2 — Scenario sandbox version helpers.
 *
 * The "scenario sandbox" pattern (per [F-S1-04] and [B-OQ-02]) lets a
 * scenario fork live forecast / distribution rows into an isolated
 * `version='scenario-{id}'` namespace. Production surfaces (Workbench
 * grids, Charging editors, Backlog, Rollup view) accept an optional
 * `scenarioVersion?: string` prop and forward it to the API as the
 * `version` query parameter. When undefined, the surface targets the
 * live forecast — current behaviour, fully backward compatible.
 *
 * This module is the single source of truth for the version-string
 * format. All sandbox-aware code paths (T1 ScenarioContext, T2
 * surfaces / version threading, T3 compare, T4 promote) MUST resolve
 * version strings via these helpers — never inline a `scenario-${id}`
 * literal.
 */

/**
 * Standard live-forecast sentinel used by the F-cluster Distribution
 * service and the Charging API. Distribution rows with this version
 * are the canonical (non-sandboxed) edges.
 */
export const FORECAST_VERSION = 'forecast' as const;

/**
 * Build the sandbox version string for a scenario id.
 * Matches `services/scenario_cost_allocation.py::scenario_version()`.
 */
export function buildScenarioVersion(scenarioId: number): string {
  return `scenario-${scenarioId}`;
}

/**
 * Parse a version string back to a scenario id.
 * Returns `null` if the input is not a sandbox version string.
 */
export function parseScenarioVersion(version: string | null | undefined): number | null {
  if (!version) return null;
  const match = /^scenario-(\d+)$/.exec(version);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) ? id : null;
}

/**
 * True when the version string targets a scenario sandbox (vs. live forecast).
 */
export function isScenarioVersion(version: string | null | undefined): boolean {
  return parseScenarioVersion(version) !== null;
}

/**
 * Resolve the version string a surface should use.
 * - When `scenarioVersion` is provided, return it as-is (sandbox mode).
 * - Otherwise return undefined (caller should default to live forecast).
 *
 * Surfaces that always need a string (e.g. for an HTTP query param)
 * may fall back to {@link FORECAST_VERSION}.
 */
export function resolveVersion(
  scenarioVersion: string | null | undefined,
): string | undefined {
  return scenarioVersion ?? undefined;
}
