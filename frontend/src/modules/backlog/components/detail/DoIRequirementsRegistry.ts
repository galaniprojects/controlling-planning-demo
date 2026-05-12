/**
 * DoIRequirementsRegistry — static map of DoI level → required fields.
 * Working definition per [A-BK-30]. This will migrate to a backend endpoint
 * once [A-OQ-04] is fully specced.
 *
 * Each entry lists fields that MUST be completed at that DoI level.
 * Fields from lower DoI levels are automatically carried forward.
 */

/**
 * Define-page deep-linking targets. The Define page's DoI overlay reads
 * `target_tab` + `field_anchor` to render each missing field as a
 * deep-link that switches to the right tab and scrolls / focuses the
 * input. The legacy Backlog detail surfaces (still consumed via the
 * /backlog/{id} → /define/{id} redirect path) ignore these fields and
 * continue to render the label + rationale only.
 */
export type DefineTabId =
  | 'identity'
  | 'tech_navigator'
  | 'financials'
  | 'approval_milestones';

export interface DoIFieldRequirement {
  /** Field key (matching backend model field name). */
  field: string;
  /** Human-readable label. */
  label: string;
  /** Which section this belongs to for grouping. */
  section: 'tech_navigator' | 'financial' | 'project';
  /** Brief explanation of why this field matters at this DoI level. */
  rationale: string;
  /**
   * Which Define tab the field lives on. The overlay uses this to
   * switch tabs when a missing-field deep-link is clicked.
   */
  target_tab: DefineTabId;
  /**
   * DOM anchor id rendered next to the input on the tab. Components
   * should expose `id={field_anchor}` (and `data-define-anchor`) on
   * the focusable input or its labelled container. Used for
   * `scrollIntoView` + `focus()` on click.
   */
  field_anchor: string;
}

/**
 * Cumulative requirements: DoI N requires everything from DoI 0..N.
 * Returns the INCREMENTAL requirements for each level.
 */
export const DOI_REQUIREMENTS: Record<number, DoIFieldRequirement[]> = {
  0: [
    {
      field: 'name',
      label: 'Project name',
      section: 'project',
      rationale: 'Basic identification required from inception.',
      target_tab: 'identity',
      field_anchor: 'define-anchor-name',
    },
    {
      field: 'pipeline_stage',
      label: 'Pipeline stage',
      section: 'project',
      rationale: 'Stage must be set before DoI 0 projects appear in the backlog.',
      target_tab: 'identity',
      field_anchor: 'define-anchor-pipeline-stage',
    },
  ],
  1: [
    {
      field: 'project_type',
      label: 'Project type (P1/P2/P3)',
      section: 'tech_navigator',
      rationale:
        'Type classification determines whether the project competes in the ranked envelope (P1/P2) or is pre-funded (P3).',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-project-type',
    },
    {
      field: 'transformation_level',
      label: 'Transformation level (T0/T1/T2)',
      section: 'tech_navigator',
      rationale:
        'T-level is required at DoI 1 for cube-view categorisation.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-transformation-level',
    },
    {
      field: 'total_budget',
      label: 'Budget estimate',
      section: 'financial',
      rationale: 'High-level budget required for initial envelope calculation.',
      target_tab: 'financials',
      field_anchor: 'define-anchor-total-budget',
    },
  ],
  2: [
    {
      field: 'tn_standardization',
      label: 'Complexity: Standardization score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-standardization',
    },
    {
      field: 'tn_usage',
      label: 'Complexity: Usage score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-usage',
    },
    {
      field: 'tn_maintenance',
      label: 'Complexity: Maintenance score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-maintenance',
    },
    {
      field: 'tn_financial_benefit',
      label: 'Value Creation: Financial benefit score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-financial-benefit',
    },
    {
      field: 'tn_payback',
      label: 'Value Creation: Payback score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-payback',
    },
    {
      field: 'tn_competitive_advantage',
      label: 'Value Creation: Competitive advantage score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-tn-competitive-advantage',
    },
  ],
  3: [
    {
      field: 'composite_score',
      label: 'Composite score (computed)',
      section: 'tech_navigator',
      rationale:
        'A composite score must exist (requires all sub-criteria at DoI 2) before moving to DoI 3.',
      target_tab: 'tech_navigator',
      field_anchor: 'define-anchor-composite-score',
    },
    {
      field: 'ai_council_approved',
      label: 'AI Council approval',
      section: 'project',
      rationale:
        'AI Council sign-off is required before the project can advance to DoI 3.',
      target_tab: 'approval_milestones',
      field_anchor: 'define-anchor-ai-council-approved',
    },
  ],
  4: [],
  5: [],
};

/**
 * Map a missing-field key (returned by the backend `gate_status`
 * endpoint as a human-readable label) back to a `DoIFieldRequirement`
 * so the Define overlay can render it as a deep-link. The backend
 * historically formatted missing fields as user-facing strings; this
 * lookup tolerates both the field key and the label.
 */
export function findRequirementByKeyOrLabel(
  needle: string,
): DoIFieldRequirement | null {
  const lower = needle.trim().toLowerCase();
  for (const reqs of Object.values(DOI_REQUIREMENTS)) {
    for (const r of reqs) {
      if (
        r.field.toLowerCase() === lower ||
        r.label.toLowerCase() === lower
      ) {
        return r;
      }
    }
  }
  return null;
}

/** Get all cumulative requirements up to and including the given DoI level. */
export function getCumulativeRequirements(doi: number): DoIFieldRequirement[] {
  const result: DoIFieldRequirement[] = [];
  for (let d = 0; d <= doi; d++) {
    result.push(...(DOI_REQUIREMENTS[d] ?? []));
  }
  return result;
}
