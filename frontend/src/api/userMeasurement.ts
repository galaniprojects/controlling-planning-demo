/**
 * API client for the FD-2 charging-namespaced UM authoring endpoints.
 *
 * Mirrors `chargingApi`'s shape: small typed wrappers around the shared
 * `api` helper in `./client.ts`. Multipart upload uses fetch directly so
 * the `Content-Type: multipart/form-data` boundary is set by the browser.
 */
import { api, getCurrentUserId } from './client';
import type {
  UMAllocationKeysResponse,
  UMCellsBulkSetRequest,
  UMCellsBulkSetResponse,
  UMCsvImportResponse,
  UMInfoResponse,
  UMVersionCreateRequest,
  UMVersionDetailResponse,
  UMVersionsListResponse,
} from '@/types/userMeasurement';

const BASE = '/api/charging/user-measurement';

export const userMeasurementApi = {
  /** GET /info — CRETA-system-of-record reframe per [F-DIR-01]. */
  getInfo: () => api.get<UMInfoResponse>(`${BASE}/info`),

  /** GET /versions[?year=&quarter=&status=] */
  listVersions: (params?: {
    year?: number;
    quarter?: number;
    status?: 'draft' | 'active';
  }) => {
    const q = new URLSearchParams();
    if (params?.year !== undefined) q.set('year', String(params.year));
    if (params?.quarter !== undefined) q.set('quarter', String(params.quarter));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return api.get<UMVersionsListResponse>(
      `${BASE}/versions${qs ? '?' + qs : ''}`,
    );
  },

  /** GET /versions/{id} — header + dense cells. */
  getVersion: (versionId: number) =>
    api.get<UMVersionDetailResponse>(`${BASE}/versions/${versionId}`),

  /** POST /versions — three-origin draft creation per [F-UM-03]. */
  createVersion: (payload: UMVersionCreateRequest) =>
    api.post<UMVersionDetailResponse>(`${BASE}/versions`, payload),

  /**
   * POST /versions/from-csv — creates a DRAFT (does NOT auto-activate). The
   * controller reviews `preview.parse_errors` then activates separately.
   * Uses fetch directly so the multipart boundary is browser-managed.
   */
  importCsv: async (file: File): Promise<UMCsvImportResponse> => {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`${BASE}/versions/from-csv`, {
      method: 'POST',
      body: form,
      headers: { 'X-Current-User': getCurrentUserId() },
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(body.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  /** PATCH /versions/{id}/cells — row/column paste with per-cell audit. */
  bulkSetCells: (versionId: number, payload: UMCellsBulkSetRequest) =>
    api.patch<UMCellsBulkSetResponse>(
      `${BASE}/versions/${versionId}/cells`,
      payload,
    ),

  /** POST /versions/{id}/activate — freezes per [F-UM-02]. */
  activateVersion: (versionId: number) =>
    api.post<UMVersionDetailResponse>(
      `${BASE}/versions/${versionId}/activate`,
    ),

  /** DELETE /versions/{id} — drafts only; 409 on active. */
  deleteVersion: (versionId: number) =>
    api.delete<{ id: number; deleted: boolean }>(
      `${BASE}/versions/${versionId}`,
    ),

  /** GET /allocation-keys — distinct catalogue values per [F-AK-01]. */
  listAllocationKeys: () =>
    api.get<UMAllocationKeysResponse>(`${BASE}/allocation-keys`),
};
