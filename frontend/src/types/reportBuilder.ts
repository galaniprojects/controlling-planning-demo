/* Report Builder types */

export interface DimensionItem {
  id: string;
  display_name: string;
  category: string;
  data_type: string;
  hierarchy_parent: string | null;
}

export interface MeasureItem {
  id: string;
  display_name: string;
  category: string;
  aggregation: string;
  format: string; // currency | percent | number | hours
  compatibility_note: string | null;
  calculated?: CalculatedMeasureDef;
}

export interface CatalogResponse {
  dimensions: DimensionItem[];
  dimension_categories: string[];
  measures: MeasureItem[];
  measure_categories: string[];
}

export interface ColumnMeta {
  id: string;
  name: string;
  type: 'dimension' | 'measure';
  format?: string;
}

export interface ReportExecuteRequest {
  rows: string[];
  columns: string[];
  filters: Record<string, string[]>;
  values: string[];
}

export interface ReportExecuteResponse {
  columns: ColumnMeta[];
  rows: Record<string, string | number>[];
  total_rows: number;
  warnings: string[];
}

export interface FilterValuesResponse {
  dimension_id: string;
  values: string[];
}

export type ZoneName = 'rows' | 'columns' | 'filters' | 'values';

/* ── Cross-tab types ── */

export interface ColHeaderNode {
  label: string;
  span: number;
  children?: ColHeaderNode[];
}

export interface ColLeaf {
  colKey: string;          // "colVal1|colVal2|measureId"
  measureId: string;
  measureFormat: string;
  labels: string[];        // column dim values for this path
}

export interface RowEntry {
  dimValues: Record<string, string>;
  cells: Record<string, number | null>;
}

export interface RowGroup {
  key: string;
  label: string;
  children: RowEntry[];
  subtotals: Record<string, number>;
}

export interface CrossTabData {
  headerLevels: ColHeaderNode[][];   // one array per header row
  colLeaves: ColLeaf[];
  rowGroups: RowGroup[];
  grandTotals: Record<string, number>;
}

/* ── Conditional formatting types ── */

export type FormatOperator = '<' | '<=' | '>' | '>=' | '=' | 'between';

export interface ConditionalFormatRule {
  id: string;
  measureId: string;
  operator: FormatOperator;
  value: number;
  value2?: number;
  color: string;
  label?: string;
}

export type FormatPresetId = 'budget_variance_rag' | 'utilisation_rag' | 'spend_threshold';

/* ── Calculated measure types ── */

export type CalcOperator = '+' | '-' | '*' | '/';

export interface CalculatedMeasureDef {
  operandA: string;       // measure ID (M01-M16 or CALC_*)
  operator: CalcOperator;
  operandB: string;       // measure ID
}

/* ── Chart view types ── */

export type ChartViewType = 'table' | 'bar' | 'line' | 'pie';

/* ── Saved report types ── */

export interface ReportDefinition {
  rows: string[];
  columns: string[];
  filters: Record<string, string[]>;
  values: string[];
  calculatedMeasures: MeasureItem[];
  formatRules: ConditionalFormatRule[];
  viewMode: ChartViewType;
}

export interface SavedReportSummary {
  id: number;
  name: string;
  description: string | null;
  created_by: string;
  is_published: boolean;
  created_at: string;
  modified_at: string;
}

export interface SavedReportDetail extends SavedReportSummary {
  definition: ReportDefinition;
}

export interface SharedReportSummary {
  id: number;
  name: string;
  description: string | null;
  created_by: string;
  is_published: boolean;
  permission: string | null;
  shared_at: string | null;
  created_at: string;
  modified_at: string;
}
