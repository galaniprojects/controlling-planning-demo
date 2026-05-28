/**
 * Parse a save-time validation error from the Stage 1 distribution API
 * into a discriminated union so the editor banner can render a typed
 * message (cycle path / depth violating path / raw text).
 *
 * The backend returns 409 with a structured JSON detail per Service
 * Workbench S1 (`_validation_error_to_http` in
 * `backend/routers/charging.py`):
 *
 *     { "detail": { "message": "...", "cycle_chain"?: [...], "violating_path"?: [...] } }
 *
 * The frontend `api/client.ts` collapses 4xx/5xx bodies into
 * `Error(JSON.stringify(detail))`, so every caller sees a single string
 * `Error.message`. The historical pattern (today's editor lines 766–781)
 * is `JSON.parse(err.message)` → look for `cycle_chain`. Wave B adds
 * `violating_path` for depth violations (Session 1 backend work).
 *
 * Callers pass the raw `err.message` here and switch on the returned
 * discriminator. Unknown shapes degrade to `{ type: 'generic' }`.
 */

export type ParsedAllocationError =
  | {
      type: 'cycle';
      message: string;
      /** Ordered entity ids that form the cycle (`A → B → C → A`). */
      cycleChain: string[];
    }
  | {
      type: 'depth';
      message: string;
      /** Ordered entity ids of the path that exceeds the cap. */
      violatingPath: string[];
    }
  | { type: 'generic'; message: string };

/**
 * Discriminate a raw API error message string into a typed allocation
 * error. Always returns a value — never throws.
 *
 * Heuristics:
 * - Try `JSON.parse(raw)`.
 * - If `cycle_chain` is a non-empty array of strings → `cycle`.
 * - Else if `violating_path` is a non-empty array of strings → `depth`.
 * - Else use `message` / the raw string as `generic`.
 */
export function parseAllocationError(raw: string): ParsedAllocationError {
  if (!raw || typeof raw !== 'string') {
    return { type: 'generic', message: 'Save failed' };
  }

  // Try structured JSON first.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { type: 'generic', message: raw };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { type: 'generic', message: raw };
  }

  const obj = parsed as Record<string, unknown>;
  const message = typeof obj.message === 'string' ? obj.message : raw;

  const cycleChain = obj.cycle_chain;
  if (Array.isArray(cycleChain) && cycleChain.every((s) => typeof s === 'string') && cycleChain.length > 0) {
    return { type: 'cycle', message, cycleChain: cycleChain as string[] };
  }

  const violatingPath = obj.violating_path;
  if (
    Array.isArray(violatingPath) &&
    violatingPath.every((s) => typeof s === 'string') &&
    violatingPath.length > 0
  ) {
    return {
      type: 'depth',
      message,
      violatingPath: violatingPath as string[],
    };
  }

  return { type: 'generic', message };
}
