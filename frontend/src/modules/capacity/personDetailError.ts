/**
 * personDetailErrorMessage — maps a getPersonDetail failure to user-facing copy.
 *
 * Both person-detail surfaces (the workspace side panel `PersonDetail` and
 * the My Team `PersonDetailDrawer`) previously collapsed every failure into a
 * single generic "Failed to load person details." line. That hid two
 * meaningfully different cases:
 *
 *   - 403 — the caller (a CC Owner) is not allowed to read another cost
 *     centre's people. This is intentional authorization, not a transient
 *     error; the user should be told it's an access boundary, not a glitch.
 *   - 404 — the person (or cost-centre path) could not be resolved.
 *
 * Anything else (network, 5xx, parse) stays the generic transient message so
 * the user knows a retry might help.
 */
import { ApiError } from '@/api/client';

export function personDetailErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return 'You do not have access to this cost centre.';
    }
    if (err.status === 404) {
      return 'Person details could not be found.';
    }
  }
  return 'Failed to load person details. Please try again.';
}
