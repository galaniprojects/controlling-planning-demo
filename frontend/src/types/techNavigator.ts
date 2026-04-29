/**
 * Tech Navigator types — frontend mirror of `backend/schemas/tech_navigator.py`.
 *
 * Spec references: [A-TN-01]..[A-TN-09].
 *
 * The five sub-criteria values and the two reserved slots are all integers 1-5
 * (or null while unscored). Computed scores are floats (rounded to 2 decimals
 * server-side). The composite_score is null until BOTH axis scores are non-null
 * — partial profiles do not contribute to ranking [A-PRI-01].
 */

export type TransformationLevel = 'T0' | 'T1' | 'T2';
export type ProjectType = 1 | 2 | 3;
export type TshirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL';

/** Integer 1-5 sub-criterion score, or null while unscored. */
export type SubCriterionScore = 1 | 2 | 3 | 4 | 5 | null;

export interface ComplexityWeights {
  standardization: number;
  usage: number;
  maintenance: number;
}

export interface ValueCreationWeights {
  financial: number;
  payback: number;
  competitive: number;
}

export interface RankingWeights {
  value: number;
  complexity: number;
}

export interface TshirtThresholds {
  xs_max: number;
  s_max: number;
  m_max: number;
  l_max: number;
}

export interface TechNavigatorWeights {
  complexity: ComplexityWeights;
  value_creation: ValueCreationWeights;
  ranking: RankingWeights;
  tshirt: TshirtThresholds;
}

export interface TechNavigatorProfile {
  project_id: string;
  project_type: ProjectType | null;
  transformation_level: TransformationLevel | null;

  // Raw sub-criteria (1-5 or null)
  tn_standardization: SubCriterionScore;
  tn_usage: SubCriterionScore;
  tn_maintenance: SubCriterionScore;
  tn_financial_benefit: SubCriterionScore;
  tn_payback: SubCriterionScore;
  tn_competitive_advantage: SubCriterionScore;
  tn_value_reserved_1: SubCriterionScore;
  tn_value_reserved_2: SubCriterionScore;

  // Denormalized computed scores (1-5 weighted averages)
  complexity_score: number | null;
  value_creation_score: number | null;
  composite_score: number | null;

  // Derived from total_budget against admin t-shirt thresholds
  tshirt_size: TshirtSize | null;
  total_budget: number | null;

  // Active admin weights snapshot at read time
  weights: TechNavigatorWeights;
}

/**
 * Partial-update body for PUT /api/projects/{id}/tech-navigator.
 *
 * All fields optional. Sub-criteria can be set to null to clear a score.
 */
export interface TechNavigatorUpdate {
  project_type?: ProjectType | null;
  transformation_level?: TransformationLevel | null;
  tn_standardization?: SubCriterionScore;
  tn_usage?: SubCriterionScore;
  tn_maintenance?: SubCriterionScore;
  tn_financial_benefit?: SubCriterionScore;
  tn_payback?: SubCriterionScore;
  tn_competitive_advantage?: SubCriterionScore;
  tn_value_reserved_1?: SubCriterionScore;
  tn_value_reserved_2?: SubCriterionScore;
}
