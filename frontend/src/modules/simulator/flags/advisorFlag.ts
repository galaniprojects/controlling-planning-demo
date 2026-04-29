/**
 * v5 B2 — AI Advisor feature flag.
 *
 * Per the B2 plan, the v4 advisor code is preserved verbatim under
 * `modules/simulator/advisor/` but is hidden behind a build-time flag
 * so it doesn't ship in the demo by default. Set
 * `VITE_ENABLE_AI_ADVISOR=true` in your `.env.local` to render the
 * advisor button + drawer in the workspace header.
 */

export const ADVISOR_ENABLED: boolean =
  import.meta.env.VITE_ENABLE_AI_ADVISOR === 'true';
