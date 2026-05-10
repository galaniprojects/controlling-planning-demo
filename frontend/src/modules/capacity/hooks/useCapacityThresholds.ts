/**
 * useCapacityThresholds — v5.2 closeout.
 *
 * Reads display thresholds from `GET /api/capacity/planning-parameters?group=thresholds`
 * so capacity surfaces (currently `UnassignedSummary`, future: dashboard
 * card thresholds) can defer to admin-editable values instead of hardcoding
 * cut-offs in the component.
 *
 * Resilience: if the fetch fails, the hook returns the historical hardcoded
 * defaults (`warn = 1`, `danger = 200`) so the UI never breaks. The same
 * defaults seed the database, so the dynamic and fallback paths render the
 * same colours on a clean install.
 *
 * Dedup: a module-level `inflight` map coalesces concurrent mounts (mirrors
 * the W6 P2.B pattern in `useDashboardForecastData`). Cleared in `.finally()`
 * so it doesn't grow unbounded.
 *
 * Decision history (PROGRESS.md W6 #14): the W6 polish round documented the
 * thresholds as "stay hardcoded for v5.2 — promoting to a `PlanningParameter`
 * also needs admin endpoint, settings card, and cache-invalidation
 * plumbing". The closeout PR took the full-wiring path (rows + endpoint +
 * dynamic hook) per user direction.
 */
import { useEffect, useState } from 'react';
import { capacityApi } from '@/api/endpoints';
import type { CapacityPlanningParametersResponse } from '@/types/api';

const DEFAULT_WARN_HOURS = 1;
const DEFAULT_DANGER_HOURS = 200;

const WARN_KEY = 'capacity.unassigned_summary.warn_threshold_hours';
const DANGER_KEY = 'capacity.unassigned_summary.danger_threshold_hours';

const inflight = new Map<string, Promise<CapacityPlanningParametersResponse>>();

function fetchParamsDeduped(
  group: string,
): Promise<CapacityPlanningParametersResponse> {
  const existing = inflight.get(group);
  if (existing) return existing;
  const p = capacityApi.getPlanningParameters(group).finally(() => {
    inflight.delete(group);
  });
  inflight.set(group, p);
  return p;
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface CapacityUnassignedThresholds {
  warnThresholdHours: number;
  dangerThresholdHours: number;
  isLoading: boolean;
}

/**
 * @param group PlanningParameter group to fetch. Defaults to `'thresholds'`,
 *   the only group capacity surfaces consume today. Exposed as an arg so
 *   future callers (e.g. dashboard threshold cards) can reuse the same
 *   dedup'd fetch without rewriting the hook.
 */
export function useCapacityThresholds(
  group: string = 'thresholds',
): CapacityUnassignedThresholds {
  const [warn, setWarn] = useState(DEFAULT_WARN_HOURS);
  const [danger, setDanger] = useState(DEFAULT_DANGER_HOURS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchParamsDeduped(group)
      .then((res) => {
        if (cancelled) return;
        const byKey = new Map(res.items.map((it) => [it.key, it.current_value]));
        const w = parseIntOr(byKey.get(WARN_KEY), DEFAULT_WARN_HOURS);
        let d = parseIntOr(byKey.get(DANGER_KEY), DEFAULT_DANGER_HOURS);
        // Defensive: if an admin saves a danger value below the warn value
        // the cell ramp would invert (everything ≥ warn would render red).
        // Clamp danger to at least warn so the amber band stays non-empty.
        if (d < w) d = w;
        setWarn(w);
        setDanger(d);
      })
      .catch(() => {
        // Keep defaults on failure — UI never breaks.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [group]);

  return {
    warnThresholdHours: warn,
    dangerThresholdHours: danger,
    isLoading,
  };
}
