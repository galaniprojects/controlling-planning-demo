/**
 * Shared types for the Detail View Grid component.
 * Used across Approvals, Intake, Change History, and Forecast Cycle Review.
 */

export interface DetailViewMonthValue {
  month: string;
  /** Primary unit value: hours (internal) or EUR (external) */
  proposed: number;
  /** EUR equivalent of proposed value */
  proposed_eur: number;
  /** Comparison only: current (before) value in primary unit */
  current?: number;
  /** Comparison only: current EUR equivalent */
  current_eur?: number;
  /** Comparison only: whether this cell has changed */
  is_changed?: boolean;
}

export interface DetailViewLineItem {
  id: string;
  name: string;
  category: 'internal' | 'external';
  /** 'hours' for internal resources, 'eur' for external costs */
  unit: 'hours' | 'eur';
  months: DetailViewMonthValue[];
  proposed_total: number;
  proposed_total_eur: number;
  /** Comparison only */
  current_total?: number;
  current_total_eur?: number;
}

export interface DetailViewKPI {
  label: string;
  value: number;
  format: 'currency' | 'currency_delta';
  color?: string;
  secondaryLabel?: string;
}

export interface DetailViewGridData {
  months: string[];
  line_items: DetailViewLineItem[];
  kpis: DetailViewKPI[];
}
