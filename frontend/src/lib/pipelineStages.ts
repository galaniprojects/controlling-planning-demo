/**
 * Pipeline stage + DoI constants and helpers [A-PS-01..13] [A-DOI-01..11].
 *
 * Mirrors `backend/services/pipeline.py::STAGES` and the DoI macro phases
 * from `[A-DOI-01]` (Demand Funnel 0–2, Change Execution 3–4, Operation 4–5).
 *
 * Used by:
 * - `PipelineStageBadge` for consistent stage colour theming everywhere.
 * - `DoIBadge` for the DoI 0–5 indicator + macro-phase grouping.
 * - `PipelineTransitionMenu` for the controller stage-transition controls.
 * - Backlog filters and the Run Portfolio sub-module's stage-aware logic.
 */

export const PIPELINE_STAGES = [
  'Proposed',
  'Under Evaluation',
  'Approved',
  'Active',
  'Hyper-maintenance',
  'Operate',
  'Retired',
  'Paused',
  'Cancelled',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stages that participate in the ranked backlog [A-BK-01]. */
export const BACKLOG_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'Proposed',
  'Under Evaluation',
  'Approved',
  'Active',
  'Paused',
]);

/** Steady-state stages — the Run Portfolio audience [A-PS-12] [E-11]. */
export const OPERATE_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'Hyper-maintenance',
  'Operate',
  'Retired',
]);

/** Off-path stages without a DoI digit [A-PS-03] [A-PS-10]. */
export const OFF_PATH_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'Paused',
  'Cancelled',
]);

/**
 * Tailwind colour map per pipeline stage.
 * Keep light variants AND `dark:` variants per CLAUDE.md dark-mode rules.
 */
export const PIPELINE_STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  Proposed:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Under Evaluation':
    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  Approved:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Active:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Hyper-maintenance':
    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  Operate:
    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  Retired: 'bg-muted text-muted-foreground',
  Paused:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Cancelled:
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

/** DoI macro phase mapping per [A-DOI-01]. DoI 4 sits in both Change Execution
 * and Operation; we return the most-leftward phase for label clarity. */
export type DoIMacroPhase =
  | 'Demand Funnel'
  | 'Change Execution'
  | 'Operation';

export function doiMacroPhase(doi: number | null | undefined): DoIMacroPhase | null {
  if (doi === null || doi === undefined) return null;
  if (doi <= 2) return 'Demand Funnel';
  if (doi <= 4) return 'Change Execution';
  return 'Operation';
}

/** Short label for each DoI level (mirrors `[A-DOI-01..10]`). */
export const DOI_LEVEL_LABEL: Record<number, string> = {
  0: 'Evaluate',
  1: 'AI Council Pass',
  2: 'Pitch Board Ready',
  3: 'Pitch Board Approved',
  4: 'Hyper-maintenance / Operate',
  5: 'Operate',
};

/**
 * Tailwind colour map per DoI level. Demand Funnel = sky, Change Execution =
 * indigo, Operation = teal. Keeps the visual grouping aligned with the macro
 * phases without overloading meaning.
 */
export const DOI_BADGE_CLASS: Record<number, string> = {
  0: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300',
  1: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  2: 'bg-sky-200 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  3: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  4: 'bg-indigo-200 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  5: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

/** Default DoI for a stage (mirrors backend `services/pipeline.doi_for_stage`). */
export function doiForStage(stage: PipelineStage | string | null): number | null {
  switch (stage) {
    case 'Proposed':
      return 0;
    case 'Under Evaluation':
      return 2;
    case 'Approved':
    case 'Active':
      return 3;
    case 'Hyper-maintenance':
      return 4;
    case 'Operate':
      return 5;
    case 'Retired':
      return 5;
    default:
      return null; // Paused / Cancelled / unknown
  }
}

export function isOffPathStage(
  stage: PipelineStage | string | null,
): boolean {
  if (stage === null) return false;
  return OFF_PATH_STAGES.has(stage as PipelineStage);
}
