/**
 * Tech Navigator rubric label dictionary [A-TN-03] [A-TN-04].
 *
 * Spec note (lines 53-67 of CRETA_v5_Workshop_Spec.md):
 *   "Intermediate values of each sub-criterion are defined in the KB Tech
 *   Navigator reference slides and should be mirrored in the CRETA rubric UI."
 *
 * The spec only ships endpoint definitions for level 1 and level 5. Levels 2/3/4
 * here are interpolated placeholders (clearly flagged in PROGRESS.md
 * ambiguities). The Admin Tech Navigator rubric matrix editor [D-CAT-04] is
 * the long-term home of these labels — for now we hard-code them so A7 can be
 * verified visually. When [D-CAT-04] lands the labels move to the database.
 *
 * Counterintuitive Complexity convention [A-TN-02]: a HIGHER Complexity score
 * means LOWER real-world complexity (simpler, more standard, easier to run).
 * The 5-end is therefore "best for KB" and the 1-end is "hardest for KB".
 */

export interface RubricLevel {
  /** Score 1-5. */
  level: 1 | 2 | 3 | 4 | 5;
  /** Short headline shown under the level button. */
  headline: string;
  /** Full descriptive paragraph shown in the tooltip / expanded panel. */
  description: string;
}

export interface SubCriterionRubric {
  /** Field name on the project model (must match backend `tn_*` keys). */
  field: string;
  /** Display title (e.g. "Standardization of solution"). */
  title: string;
  /** Short axis label (e.g. "Complexity" or "Value Creation"). */
  axisLabel: 'complexity' | 'value_creation';
  /** Subtitle shown under the title — short rationale. */
  subtitle: string;
  /** Five level rubric entries, in ascending score order. */
  levels: [RubricLevel, RubricLevel, RubricLevel, RubricLevel, RubricLevel];
  /**
   * Weight key inside the matching axis weights bucket (e.g. "standardization"
   * for ComplexityWeights.standardization).
   */
  weightKey: string;
}

// ---------------------------------------------------------------------------
// Complexity sub-criteria (Y-axis) [A-TN-03]
//   Standardization 40 % | Usage 40 % | Maintenance and support 20 %
// ---------------------------------------------------------------------------

export const COMPLEXITY_SUB_CRITERIA: SubCriterionRubric[] = [
  {
    field: 'tn_standardization',
    title: 'Standardization of solution',
    axisLabel: 'complexity',
    subtitle: 'How off-the-shelf is the technology?',
    weightKey: 'standardization',
    levels: [
      {
        level: 1,
        headline: 'Self-developed / heavily customized',
        description:
          'Self-developed or heavily customized. No reliance on standard products. KB owns the full implementation and maintenance burden.',
      },
      {
        level: 2,
        headline: 'Vendor product, deeply customized',
        description:
          'Commercial product but with substantial custom code, custom integrations, or custom extensions that diverge from vendor standard.',
      },
      {
        level: 3,
        headline: 'Vendor product with moderate customization',
        description:
          'Standard product with some configuration and a moderate amount of custom integration. Vendor upgrade path remains feasible.',
      },
      {
        level: 4,
        headline: 'Standard product, mostly configured',
        description:
          'Standard vendor product. Customization limited to configuration; integrations use documented APIs.',
      },
      {
        level: 5,
        headline: 'Off-the-shelf SaaS (config only)',
        description:
          'Off-the-shelf SaaS using configuration only and existing APIs. Lowest implementation and lifecycle complexity.',
      },
    ],
  },
  {
    field: 'tn_usage',
    title: 'Usage',
    axisLabel: 'complexity',
    subtitle: 'How broad is the deployment footprint inside KB?',
    weightKey: 'usage',
    levels: [
      {
        level: 1,
        headline: 'Local or adapted divisional solution',
        description:
          'Used by a single division or a single location with locally adapted variants. Limited reuse value across the group.',
      },
      {
        level: 2,
        headline: 'Multi-location, single division',
        description:
          'Adopted across several locations within one division. Some divisional standardization but not group-wide.',
      },
      {
        level: 3,
        headline: 'Cross-divisional, partial coverage',
        description:
          'Used by multiple divisions with partial coverage. Group-level shape emerging but not yet uniform.',
      },
      {
        level: 4,
        headline: 'Group solution, broad usage',
        description:
          'Group-wide solution with broad usage. Some local exceptions but the dominant footprint is uniform.',
      },
      {
        level: 5,
        headline: 'Group solution, uniform high volume',
        description:
          'Group solution with high usage — uniform configuration, high transaction volume. Maximum economy of scale.',
      },
    ],
  },
  {
    field: 'tn_maintenance',
    title: 'Maintenance and support',
    axisLabel: 'complexity',
    subtitle: 'How hard is it to keep this running?',
    weightKey: 'maintenance',
    levels: [
      {
        level: 1,
        headline: 'Very difficult, no external support',
        description:
          'Very difficult to maintain. No external support available. Operational continuity depends on specific individuals.',
      },
      {
        level: 2,
        headline: 'Difficult, limited external support',
        description:
          'Difficult to maintain. External support exists but is limited, slow, or expensive. Internal expertise still critical.',
      },
      {
        level: 3,
        headline: 'Manageable, mixed support',
        description:
          'Manageable with mixed internal and external support. No single point of failure but requires sustained attention.',
      },
      {
        level: 4,
        headline: 'Easy, good vendor support',
        description:
          'Easy to maintain with good vendor support. Standard runbooks exist and KB-internal effort is bounded.',
      },
      {
        level: 5,
        headline: 'Very easy, excellent vendor support',
        description:
          'Very easy. IT standard with excellent vendor support and a mature partner ecosystem. Minimal KB-internal effort.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Value Creation sub-criteria (X-axis) [A-TN-04]
//   Financial benefit 50 % | Payback 40 % | Competitive advantage 10 %
// Reserved slots [A-TN-05] are intentionally not surfaced in v5.
// ---------------------------------------------------------------------------

export const VALUE_CREATION_SUB_CRITERIA: SubCriterionRubric[] = [
  {
    field: 'tn_financial_benefit',
    title: 'Financial benefit',
    axisLabel: 'value_creation',
    subtitle: 'Magnitude of net financial impact (dominant factor).',
    weightKey: 'financial',
    levels: [
      {
        level: 1,
        headline: 'Negligible or speculative',
        description:
          'Negligible or speculative financial benefit. No quantified business case at this stage.',
      },
      {
        level: 2,
        headline: 'Small, qualitative benefit',
        description:
          'Small, mostly qualitative benefit. Quantified savings or revenue uplift is modest and uncertain.',
      },
      {
        level: 3,
        headline: 'Moderate, quantified benefit',
        description:
          'Moderate financial benefit with a credible quantified case. Sensitivity acceptable.',
      },
      {
        level: 4,
        headline: 'Significant, well-quantified benefit',
        description:
          'Significant financial benefit, well quantified, with conservative assumptions and clear cost drivers.',
      },
      {
        level: 5,
        headline: 'Outsized, board-relevant impact',
        description:
          'Outsized, board-relevant financial impact. Multiple cross-checks confirm magnitude. Material to portfolio outcomes.',
      },
    ],
  },
  {
    field: 'tn_payback',
    title: 'Payback',
    axisLabel: 'value_creation',
    subtitle: 'Speed of return after investment.',
    weightKey: 'payback',
    levels: [
      {
        level: 1,
        headline: 'Very long payback (> 5 years)',
        description:
          'Very long payback horizon — beyond five years or hard to project. Investment economics are stretched.',
      },
      {
        level: 2,
        headline: 'Long payback (3-5 years)',
        description:
          'Long payback (roughly three to five years). Acceptable for strategic bets but not a fast-return profile.',
      },
      {
        level: 3,
        headline: 'Moderate payback (~ 2 years)',
        description:
          'Moderate payback in the order of two years. Standard portfolio profile.',
      },
      {
        level: 4,
        headline: 'Fast payback (~ 1 year)',
        description:
          'Fast payback in the order of one year. Strong incremental case.',
      },
      {
        level: 5,
        headline: 'Immediate / sub-annual payback',
        description:
          'Payback within the same fiscal year, or near-immediate cash impact. Highest value-time profile.',
      },
    ],
  },
  {
    field: 'tn_competitive_advantage',
    title: 'Competitive advantage',
    axisLabel: 'value_creation',
    subtitle: 'Strategic differentiation enabled.',
    weightKey: 'competitive',
    levels: [
      {
        level: 1,
        headline: 'No differentiation',
        description:
          'No competitive differentiation. Pure parity-keeping or table-stakes work.',
      },
      {
        level: 2,
        headline: 'Marginal differentiation',
        description:
          'Marginal differentiation. Helps in narrow situations but does not move the strategic needle.',
      },
      {
        level: 3,
        headline: 'Notable differentiation',
        description:
          'Notable differentiation in some markets or customer segments. Visible to the field organisation.',
      },
      {
        level: 4,
        headline: 'Strong differentiation',
        description:
          'Strong differentiation. Enables KB-specific capability that competitors would need years to replicate.',
      },
      {
        level: 5,
        headline: 'Strategic moat',
        description:
          'Strategic moat. Enables a class of business or service that meaningfully alters KB market position.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Transformation level [A-TN-07]
// ---------------------------------------------------------------------------

export const TRANSFORMATION_LEVELS: ReadonlyArray<{
  value: 'T0' | 'T1' | 'T2';
  label: string;
  description: string;
}> = [
  {
    value: 'T0',
    label: 'T0 — just better',
    description:
      'Incremental improvement of an existing capability. Better, faster, cheaper — but the same kind of work.',
  },
  {
    value: 'T1',
    label: 'T1 — paper to software',
    description:
      'Digitisation of an analog or manual process. The activity itself moves into software.',
  },
  {
    value: 'T2',
    label: 'T2 — new business',
    description:
      'Enables something previously not possible. Opens a new product, service, or business model for KB.',
  },
];

// ---------------------------------------------------------------------------
// Project Type [A-TN-08]
// ---------------------------------------------------------------------------

export const PROJECT_TYPES: ReadonlyArray<{
  value: 1 | 2 | 3;
  label: string;
  ringClass: string;
  description: string;
}> = [
  {
    value: 1,
    label: 'Type 1 — Project with business case',
    ringClass: 'ring-foreground',
    description:
      'Standard investment with a quantified business case. Competes on score within the ranked budget envelope.',
  },
  {
    value: 2,
    label: 'Type 2 — Strategic / consulting',
    ringClass: 'ring-amber-500',
    description:
      'Strategic need or consulting without a specific technology bet. Competes on score; strategic rationale may justify a score override.',
  },
  {
    value: 3,
    label: 'Type 3 — Legal / compliance / security / lifecycle',
    ringClass: 'ring-red-500',
    description:
      'Legal, compliance, security, or lifecycle need. Exempt from the cutoff and funded off the top of the budget before ranking.',
  },
];
