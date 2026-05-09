/**
 * ghostOverlay — v5.2 W5 Track A (S6b, spec §9.4 + §9.6 + §9.8).
 *
 * Pure helpers that translate the active assignment session + project
 * resource-request data + the timeline's heatmap rows into a per-person
 * per-month ghost-segment map. The map is consumed by `PersonTimelineRow`
 * (and `FlatPersonRow`) to overlay dashed-border ghost blocks on top of
 * the existing utilization bars while assignment mode is active.
 *
 * Shape of a ghost:
 *   - `kind: 'ghost'`     → not yet assigned in this session; clicking
 *                            assigns the person to the month for the full
 *                            remaining request hours.
 *   - `kind: 'session'`   → just assigned in the current session (not yet
 *                            saved). Solid border, full opacity. Clicking
 *                            reverts to a ghost (§9.6 "Undo").
 *
 * Visual differentiation (§9.4):
 *   - `isMatchingRole`: true  → 30% opacity, 1.5px dashed border in
 *                                project color.
 *   - `isMatchingRole`: false → 15% opacity, 1px dashed border.
 *
 * Border colour overrides (§9.4 + §9.8):
 *   - `willOverAllocate`: true → red border (over-allocation preview).
 *   - `changeDirection`: 'increase' → blue border (CR re-confirmation).
 *   - `changeDirection`: 'decrease' → orange border.
 *
 * Pure module — no React, no fetches. Tested via `tsc --noEmit` and the
 * inline computations below; integration coverage comes from the visual
 * verification on the timeline workspace.
 */

import type { ProjectAssignmentDetail, MonthlyHoursItem, RequestAssignment } from '@/types/api';
import type { MonthCell } from './timeAxis';
import type { AssignmentMap } from '../assignment/AssignmentStateContext';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-(person × month) overlay element above the timeline bar. */
export interface GhostSegment {
  /** Discriminator — see module doc. */
  kind: 'ghost' | 'session';
  /** Resource request this ghost belongs to. Stringified for context-map keys. */
  requestId: string;
  /** Project the request rolls up to (drives the colour pick). */
  projectId: string;
  /** Hours suggested for this person/month if the user clicks (or hours assigned for kind='session'). */
  hours: number;
  /** Standard hours for the person/month (denominator → segment width). */
  standardHours: number;
  /** Person's already-allocated hours that month (numerator base for the over-allocation preview). */
  currentAllocatedHours: number;
  /** True when the request's role matches the person's role (primary candidate). */
  isMatchingRole: boolean;
  /** True when applying these hours pushes the person over 100%. */
  willOverAllocate: boolean;
  /** Optional CR direction when the project was opened from a CR. */
  changeDirection: 'increase' | 'decrease' | null;
  /** Role label for tooltip text (§9.6). */
  roleLabel: string;
  /** Project label for tooltip text. */
  projectName: string;
}

/** `personId → month (YYYY-MM) → GhostSegment[]` */
export type GhostMap = Map<string, Map<string, GhostSegment[]>>;

// ---------------------------------------------------------------------------
// Inputs the hook hands to `buildGhostMap`
// ---------------------------------------------------------------------------

export interface RequestOverlayInput {
  requestId: string;
  /** Used for "Matching role" detection — compared by string equality against `PersonRowData.roleName`. */
  roleLabel: string;
  /** Hours requested per month — keyed by `YYYY-MM`. */
  monthsHours: Map<string, number>;
  /** Server-side current assignments — keyed by `YYYY-MM`, list of `{personId, hours}`. */
  serverAssignments: Map<string, Array<{ personId: string; hours: number }>>;
  /** Optional CR direction (drives the §9.8 blue/orange border). */
  changeDirection: 'increase' | 'decrease' | null;
}

export interface PersonOverlayInput {
  personId: string;
  personName: string;
  /** Person's role label — compared verbatim to `RequestOverlayInput.roleLabel`. */
  roleLabel: string;
  /** Per-month utilization snapshot used for over-allocation prediction. */
  cellsByMonth: Record<string, MonthCell>;
}

export interface BuildGhostMapInput {
  /** Active session's project metadata — used only for project-name lookups. */
  projectId: string;
  projectName: string;
  /** Per-request inputs — one entry per `request_type='resource'` request that's in scope. */
  requests: RequestOverlayInput[];
  /** All visible candidate people across the timeline, with role labels. */
  people: PersonOverlayInput[];
  /** Local-state assignments from `useAssignmentState().session.assignments`. */
  sessionAssignments: AssignmentMap;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum of hours assigned to a (request, month) in this session. */
function sessionHoursFor(
  sessionAssignments: AssignmentMap,
  requestId: string,
  month: string,
): number {
  const reqMap = sessionAssignments.get(requestId);
  if (!reqMap) return 0;
  const list = reqMap.get(month);
  if (!list) return 0;
  return list.reduce((s, a) => s + a.hours, 0);
}

/** True when the session has assigned `personId` to (request, month). */
function sessionHasPerson(
  sessionAssignments: AssignmentMap,
  requestId: string,
  month: string,
  personId: string,
): { has: boolean; hours: number } {
  const reqMap = sessionAssignments.get(requestId);
  const list = reqMap?.get(month);
  if (!list) return { has: false, hours: 0 };
  const found = list.find((a) => a.personId === personId);
  return found
    ? { has: true, hours: found.hours }
    : { has: false, hours: 0 };
}

/** Sum of server hours assigned to (request, month). */
function serverHoursFor(
  serverAssignments: Map<string, Array<{ personId: string; hours: number }>>,
  month: string,
): number {
  return (serverAssignments.get(month) ?? []).reduce((s, a) => s + a.hours, 0);
}

/** Convert a flat `RequestAssignment[]` into a `month → list` map. */
export function indexServerAssignments(
  rows: readonly RequestAssignment[],
): Map<string, Array<{ personId: string; hours: number }>> {
  const out = new Map<string, Array<{ personId: string; hours: number }>>();
  for (const r of rows) {
    const list = out.get(r.month) ?? [];
    list.push({ personId: r.person_id, hours: r.hours });
    out.set(r.month, list);
  }
  return out;
}

/** Convert a flat `MonthlyHoursItem[]` into a `month → hours` map. */
export function indexMonthlyHours(
  rows: readonly MonthlyHoursItem[],
  fallbackHours: number,
  fallbackMonths: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    out.set(r.month, r.hours);
  }
  // Fill any missing month with the request's flat per-month hours so the
  // overlay still surfaces ghosts even if the per-month hours endpoint
  // returned a sparse list (it currently emits one row per month, but the
  // fallback keeps us robust against future schema changes).
  for (const m of fallbackMonths) {
    if (!out.has(m)) out.set(m, fallbackHours);
  }
  return out;
}

/** Generate ISO month sequence between two `YYYY-MM` endpoints (inclusive). */
export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

// ---------------------------------------------------------------------------
// Public extractors — used by the hook to translate API responses
// ---------------------------------------------------------------------------

export function extractRequestInputs(
  detail: ProjectAssignmentDetail,
  monthlyHoursByRequest: Map<string, MonthlyHoursItem[]>,
  serverAssignmentsByRequest: Map<string, RequestAssignment[]>,
): RequestOverlayInput[] {
  const out: RequestOverlayInput[] = [];
  for (const r of detail.requests) {
    if (r.request_type !== 'resource') continue;
    if (r.status && r.status !== 'pending') continue;
    const id = String(r.id);
    const allMonths = monthsBetween(r.period_start, r.period_end);
    const hoursList = monthlyHoursByRequest.get(id) ?? [];
    const monthsHours = indexMonthlyHours(hoursList, r.hours_or_amount, allMonths);
    const serverRows = serverAssignmentsByRequest.get(id) ?? [];
    const serverAssignments = indexServerAssignments(serverRows);
    out.push({
      requestId: id,
      roleLabel: r.role_or_cost_type,
      monthsHours,
      serverAssignments,
      changeDirection: r.change_direction ?? null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Build the ghost-segment map. One pass across (request × person × month):
 *
 *   - Skip months outside the request's period (already filtered by
 *     `monthsHours.keys()`).
 *   - Compute remaining hours = requestHours − server hours − session
 *     hours assigned to other people. If the person is already assigned
 *     the full hours in this session, emit a `kind:'session'` solid
 *     overlay (so it renders as the just-assigned block per §9.4 last
 *     paragraph — clicking reverts to a ghost via `clearMonthAssignment`).
 *   - Otherwise emit a `kind:'ghost'` block with `hours = remaining`.
 *
 * The over-allocation flag uses the cell's `allocatedHours` + the ghost's
 * `hours`; we deliberately do NOT subtract any session-assigned hours
 * already applied to the same person/month for the same request — those
 * become a `'session'` block which short-circuits ghost emission anyway.
 */
export function buildGhostMap(input: BuildGhostMapInput): GhostMap {
  const { projectId, projectName, requests, people, sessionAssignments } = input;
  const out: GhostMap = new Map();

  for (const req of requests) {
    for (const person of people) {
      const isMatching = req.roleLabel === person.roleLabel;

      for (const [month, requestHours] of req.monthsHours) {
        const cell = person.cellsByMonth[month];
        if (!cell) continue;

        const std = cell.standardHours;

        // 1. If this person already has a session assignment for this
        //    request × month, render a 'session' solid overlay.
        const inSession = sessionHasPerson(
          sessionAssignments,
          req.requestId,
          month,
          person.personId,
        );
        if (inSession.has) {
          appendGhost(out, person.personId, month, {
            kind: 'session',
            requestId: req.requestId,
            projectId,
            hours: inSession.hours,
            standardHours: std,
            currentAllocatedHours: cell.allocatedHours,
            isMatchingRole: isMatching,
            willOverAllocate: false,
            changeDirection: req.changeDirection,
            roleLabel: req.roleLabel,
            projectName,
          });
          continue;
        }

        // 2. Compute remaining hours the person could take.
        //    request - server - session-other-people
        const taken =
          serverHoursFor(req.serverAssignments, month) +
          sessionHoursFor(sessionAssignments, req.requestId, month);
        const remaining = Math.max(0, requestHours - taken);
        if (remaining <= 0) continue;

        // 3. Over-allocation prediction: existing person util + ghost.
        const projected =
          std > 0
            ? ((cell.allocatedHours + remaining) / std) * 100
            : 100;
        const willOverAllocate = projected > 100;

        appendGhost(out, person.personId, month, {
          kind: 'ghost',
          requestId: req.requestId,
          projectId,
          hours: remaining,
          standardHours: std,
          currentAllocatedHours: cell.allocatedHours,
          isMatchingRole: isMatching,
          willOverAllocate,
          changeDirection: req.changeDirection,
          roleLabel: req.roleLabel,
          projectName,
        });
      }
    }
  }
  return out;
}

function appendGhost(
  map: GhostMap,
  personId: string,
  month: string,
  ghost: GhostSegment,
) {
  let perPerson = map.get(personId);
  if (!perPerson) {
    perPerson = new Map();
    map.set(personId, perPerson);
  }
  const list = perPerson.get(month) ?? [];
  list.push(ghost);
  perPerson.set(month, list);
}

// ---------------------------------------------------------------------------
// Pick which ghost to render in a single bar cell
// ---------------------------------------------------------------------------

/**
 * Decide which ghost to render for a cell when multiple are possible. Order:
 *
 *   1. Any `kind:'session'` (just-assigned overlay should always show).
 *   2. Matching-role ghost.
 *   3. First non-matching ghost.
 *
 * Returning a single ghost keeps the bar cell visually clean; multi-role
 * candidates are still visible across other people's rows.
 */
export function pickPrimaryGhost(
  ghosts: readonly GhostSegment[] | undefined,
): GhostSegment | null {
  if (!ghosts || ghosts.length === 0) return null;
  const session = ghosts.find((g) => g.kind === 'session');
  if (session) return session;
  const matching = ghosts.find((g) => g.isMatchingRole);
  if (matching) return matching;
  return ghosts[0];
}

/**
 * For collapsed-period (quarter / year) cells: aggregate the constituent
 * months' ghosts into a single representative ghost. We only emit a ghost
 * when at least one month inside the period has a ghost. Hours and
 * over-allocation roll up to the maximum across the months so the user
 * sees the worst-case footprint without expanding the period.
 *
 * Returning `null` means "no ghost overlay on the collapsed cell".
 *
 * v5.2 W6 Track C decision (W5 polish-backlog item):
 *   Use the per-month MAX rather than the average. Rationale:
 *     - The ghost overlay's purpose (§9.4) is to surface impending
 *       over-allocation BEFORE the user opens the assignment panel.
 *       Averaging would visually understate a single hot month inside
 *       a quarter (e.g. Q3 = 80% / 80% / 130% averages to 97% — looks
 *       safe — but the user would still over-allocate the third month).
 *     - The collapsed cell is a glance affordance, not a data report;
 *       MAX preserves the cautionary signal that prompts an expand.
 *     - The matching role / session-precedence logic above already
 *       picks one canonical ghost per month, so MAX of those picks
 *       maps to "worst-case month inside the period".
 */
export function aggregatePeriodGhost(
  perMonthGhosts: ReadonlyArray<readonly GhostSegment[] | undefined>,
): GhostSegment | null {
  let primary: GhostSegment | null = null;
  let maxHours = 0;
  let willOverAllocate = false;
  for (const monthGhosts of perMonthGhosts) {
    const pick = pickPrimaryGhost(monthGhosts);
    if (!pick) continue;
    if (!primary) primary = pick;
    if (pick.kind === 'session') primary = pick; // session takes precedence
    if (pick.hours > maxHours) maxHours = pick.hours;
    if (pick.willOverAllocate) willOverAllocate = true;
  }
  if (!primary) return null;
  return { ...primary, hours: maxHours, willOverAllocate };
}
