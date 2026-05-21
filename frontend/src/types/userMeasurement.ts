/**
 * Types for the FD-2 User Measurement authoring API
 * (`/api/charging/user-measurement/*`).
 *
 * Mirrors the Pydantic shapes in `backend/schemas/user_measurement.py`. The
 * legacy `UMVersionItem` / `UMCellItem` types in `@/types/api.ts` are kept
 * until FD-2 commit 7 deletes the admin shim.
 */

export type UMVersionStatus = 'draft' | 'active';
export type UMVersionSource = 'manual' | 'csv_upload' | 'copy' | 'seed';
export type UMVersionCreateOrigin = 'blank' | 'copy_active' | 'copy_prior';

export interface UMVersionSummary {
  id: number;
  year: number;
  quarter: number;
  status: UMVersionStatus;
  source: UMVersionSource;
  activated_at: string | null;
  created_at: string;
  created_by_person_id: string | null;
  copied_from_version_id: number | null;
  cell_count: number;
}

export interface UMVersionsListResponse {
  items: UMVersionSummary[];
  total: number;
}

export interface UMCell {
  s_code: string;
  charging_location_id: string;
  charging_location_code: string | null;
  value: number; // integer per [F-UM-01]
}

export interface UMVersionDetailResponse {
  version: UMVersionSummary;
  cells: UMCell[];
  /**
   * FD-5 (spec §3): allocation key per S-code present in the matrix — the
   * legend for the raw UM integers. Keyed by `s_code`; an S-code with no
   * InternalService entity behind it is simply absent from the map.
   */
  allocation_keys: Record<string, string | null>;
}

export interface UMVersionCreateRequest {
  origin: UMVersionCreateOrigin;
  year?: number | null;
  quarter?: number | null;
  source_version_id?: number | null;
}

export interface UMCellPatch {
  s_code: string;
  charging_location_id: string;
  value: number; // integer; 0 deletes
}

export interface UMCellsBulkSetRequest {
  cells: UMCellPatch[];
}

export interface UMCellMutationResult {
  s_code: string;
  charging_location_id: string;
  action: 'create' | 'update' | 'deactivate';
  old_value: number | null;
  new_value: number | null;
}

export interface UMCellsBulkSetResponse {
  mutations: UMCellMutationResult[];
  total: number;
}

export interface UMCsvImportPreview {
  inserted: number;
  skipped_zero_rows: number;
  parse_errors: string[];
}

export interface UMCsvImportResponse {
  version: UMVersionSummary;
  preview: UMCsvImportPreview;
}

export interface UMInfoResponse {
  system_of_record: 'creta' | string;
  authoring_modes: string[];
  sap_export_available: boolean;
}

export interface UMAllocationKeysResponse {
  items: string[];
  total: number;
}
