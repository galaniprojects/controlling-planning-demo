/**
 * Project-scope Session 2 — live-local preview maths (PURE).
 *
 * Non-authoritative "first feel" feedback that moves the instant an edit is
 * committed, before the server reconciles. Uses the SAME `effectiveCellValue`
 * precedence as the grid adapter so the preview and the grid can never
 * disagree:
 *
 *   - unedited cell €   = the server's resolved € (`cell.amount_eur`)
 *   - edited cell €     = internal: newHours × hourly_rate / external: new €
 *                         (matches what the server write recomputes)
 *   - anchor cell €     = the server's STORED anchor € (`cell.anchor_amount_eur`)
 *   - project budget    = Σ line totals;  delta = budget − anchor
 *
 * Anchor and unedited € come straight from the server so the preview can't drift
 * from the recalc when a stored forecast € wasn't priced at the latest rate;
 * only edited cells are derived locally (and use the same rate the server uses).
 * The server's recalculate is authoritative; this is a preview only. The RAG
 * badge and impact dashboard still wait for an explicit Recalculate.
 */
import type {
  ScenarioGridResponse,
  ScenarioGridRow,
} from '../../api/scenariosApi';
import {
  workingEditKey,
  type WorkingEdits,
} from './forecastGridAdapter';

export interface LineTotal {
  lineKey: string;
  category: 'internal' | 'external';
  name: string;
  /** Live € total (internal: Σhours×rate, external: Σ€). */
  eur: number;
  /** Anchor € total for the line (pre-overlay). */
  anchorEur: number;
}

export interface ProjectBudget {
  /** Σ live line € totals. */
  eur: number;
  /** Σ anchor line € totals. */
  anchorEur: number;
}

/** Convert one line's effective field value to € (rate applied for internal). */
function lineCellEur(
  row: ScenarioGridRow,
  effectiveFieldValue: number,
): number {
  if (row.category === 'internal') {
    return effectiveFieldValue * (row.hourly_rate ?? 0);
  }
  return effectiveFieldValue;
}

/** Per-line live + anchor € totals across the grid's months. */
export function computeLineTotals(
  response: ScenarioGridResponse,
  workingEdits: WorkingEdits,
): LineTotal[] {
  return response.rows.map((row) => {
    let eur = 0;
    let anchorEur = 0;
    for (const cell of row.cells) {
      const key = workingEditKey(row.category, row.line_key, cell.month);
      const edit = workingEdits.get(key);
      // Edited → derive locally (internal: hours×rate, external: € verbatim),
      // matching the server write recompute. Unedited → the server's resolved €.
      eur += edit ? lineCellEur(row, edit.newValue ?? 0) : cell.amount_eur;
      // Anchor → the server's stored anchor € (null when no anchor cell).
      anchorEur += cell.anchor_amount_eur ?? 0;
    }
    return {
      lineKey: row.line_key,
      category: row.category,
      name: row.sub_category_name,
      eur: Math.round(eur * 100) / 100,
      anchorEur: Math.round(anchorEur * 100) / 100,
    };
  });
}

/** Σ line totals → project budget (live + anchor). */
export function computeProjectBudget(lineTotals: LineTotal[]): ProjectBudget {
  let eur = 0;
  let anchorEur = 0;
  for (const lt of lineTotals) {
    eur += lt.eur;
    anchorEur += lt.anchorEur;
  }
  return {
    eur: Math.round(eur * 100) / 100,
    anchorEur: Math.round(anchorEur * 100) / 100,
  };
}

/** Delta of the live budget against the anchor (positive = over anchor). */
export function computeDeltaVsAnchor(budget: ProjectBudget): number {
  return Math.round((budget.eur - budget.anchorEur) * 100) / 100;
}
