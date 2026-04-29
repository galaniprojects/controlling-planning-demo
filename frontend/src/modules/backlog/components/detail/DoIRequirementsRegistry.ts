/**
 * DoIRequirementsRegistry — static map of DoI level → required fields.
 * Working definition per [A-BK-30]. This will migrate to a backend endpoint
 * once [A-OQ-04] is fully specced.
 *
 * Each entry lists fields that MUST be completed at that DoI level.
 * Fields from lower DoI levels are automatically carried forward.
 */

export interface DoIFieldRequirement {
  /** Field key (matching backend model field name). */
  field: string;
  /** Human-readable label. */
  label: string;
  /** Which section this belongs to for grouping. */
  section: 'tech_navigator' | 'financial' | 'project';
  /** Brief explanation of why this field matters at this DoI level. */
  rationale: string;
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
    },
    {
      field: 'pipeline_stage',
      label: 'Pipeline stage',
      section: 'project',
      rationale: 'Stage must be set before DoI 0 projects appear in the backlog.',
    },
  ],
  1: [
    {
      field: 'project_type',
      label: 'Project type (Type 1/2/3)',
      section: 'tech_navigator',
      rationale:
        'Type classification determines whether the project competes in the ranked envelope (T1/T2) or is pre-funded (T3).',
    },
    {
      field: 'transformation_level',
      label: 'Transformation level (T0/T1/T2)',
      section: 'tech_navigator',
      rationale:
        'T-level is required at DoI 1 for cube-view categorisation.',
    },
    {
      field: 'total_budget',
      label: 'Budget estimate',
      section: 'financial',
      rationale: 'High-level budget required for initial envelope calculation.',
    },
  ],
  2: [
    {
      field: 'tn_standardization',
      label: 'Complexity: Standardization score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
    },
    {
      field: 'tn_usage',
      label: 'Complexity: Usage score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
    },
    {
      field: 'tn_maintenance',
      label: 'Complexity: Maintenance score',
      section: 'tech_navigator',
      rationale: 'All complexity sub-criteria must be scored at DoI 2.',
    },
    {
      field: 'tn_financial_benefit',
      label: 'Value Creation: Financial benefit score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
    },
    {
      field: 'tn_payback',
      label: 'Value Creation: Payback score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
    },
    {
      field: 'tn_competitive_advantage',
      label: 'Value Creation: Competitive advantage score',
      section: 'tech_navigator',
      rationale: 'All value creation sub-criteria must be scored at DoI 2.',
    },
  ],
  3: [
    {
      field: 'composite_score',
      label: 'Composite score (computed)',
      section: 'tech_navigator',
      rationale:
        'A composite score must exist (requires all sub-criteria at DoI 2) before moving to DoI 3.',
    },
  ],
  4: [],
  5: [],
};

/** Get all cumulative requirements up to and including the given DoI level. */
export function getCumulativeRequirements(doi: number): DoIFieldRequirement[] {
  const result: DoIFieldRequirement[] = [];
  for (let d = 0; d <= doi; d++) {
    result.push(...(DOI_REQUIREMENTS[d] ?? []));
  }
  return result;
}
