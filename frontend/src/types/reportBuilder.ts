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
