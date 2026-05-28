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
 * - If the parsed object's `message` is itself a JSON-looking string
 *   (double-encoded — happens when the FastAPI middleware wraps an
 *   already-stringified detail) re-parse and use the inner object.
 * - If `cycle_chain` is a non-empty array of strings → `cycle`.
 * - Else if `violating_path` is a non-empty array of strings → `depth`.
 * - Else use `message` / the raw string as `generic`.
 *
 * S-5 hardening (Wave B follow-up):
 *  - Reject arrays explicitly (`typeof [] === 'object'` so the original
 *    guard let arrays through and the discriminator would treat
 *    array-shaped bodies as records with `undefined` fields → silent
 *    generic, but vulnerable to future field-access bugs).
 *  - Detect double-encoded JSON (`obj.message` starts with `{`) and
 *    recurse on the inner parse — preserves cycle/depth discrimination
 *    when an upstream layer JSON-stringifies the detail twice.
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

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Reject arrays explicitly — `typeof [] === 'object'` would let
    // them through the original guard and the discriminator would read
    // `cycle_chain` off an Array (always undefined), silently returning
    // generic. Tighter typing here also helps the obj cast below.
    return { type: 'generic', message: raw };
  }

  let obj = parsed as Record<string, unknown>;

  // Double-encoded JSON: some middleware paths stringify the detail
  // twice. If `obj.message` looks like a JSON object literal, attempt
  // a second parse and reuse the discriminator logic on the inner
  // record. Falls back to the outer object on any failure.
  if (typeof obj.message === 'string') {
    const inner = obj.message.trim();
    if (inner.startsWith('{')) {
      try {
        const innerParsed: unknown = JSON.parse(inner);
        if (
          innerParsed !== null &&
          typeof innerParsed === 'object' &&
          !Array.isArray(innerParsed)
        ) {
          obj = innerParsed as Record<string, unknown>;
        }
      } catch {
        // Inner blob wasn't valid JSON after all — fall through and
        // discriminate on the outer object below.
      }
    }
  }

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
