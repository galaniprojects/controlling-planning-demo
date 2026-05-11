/**
 * Define-page API wrappers.
 *
 * Endpoints introduced for the Define-page redesign:
 *   - POST /api/projects/define                 — name-only create
 *   - GET  /api/projects/{id}/define            — canonical project read
 *   - PUT  /api/projects/{id}/identity          — Identity tab payload
 *   - PUT  /api/projects/{id}/approval-milestones — Approval tab payload
 *   - PUT  /api/projects/{id}/baseline-grid     — Financials tab payload
 *
 * Backend-dev owns the schemas in `backend/schemas/projects_define.py`;
 * the canonical TypeScript mirrors live in `@/types/define`. shell-builder
 * uses those canonical types end-to-end — the create + identity + approval
 * payloads all flow through `ProjectDefineResponse` so consumers can
 * hydrate every Define tab from a single shape.
 */

import { api } from '@/api/client';
import type {
  ProjectDefineCreate,
  ProjectDefineResponse,
  ProjectIdentityUpdate,
  ProjectApprovalMilestonesUpdate,
  ProjectFinancialsUpdate,
  ProjectFinancialsSaveResponse,
} from '@/types/define';

export const defineApi = {
  /**
   * POST /api/projects/define — name-only create. Returns the new
   * project record. Backend applies defaults (`status='draft'`,
   * `capex_opex='opex'`, `start_month='2026-04'`, `project_type=null`).
   */
  create: (body: ProjectDefineCreate) =>
    api.post<ProjectDefineResponse>('/api/projects/define', body),

  /**
   * GET /api/projects/{id}/define — canonical Define-page read. Returns
   * the full project payload that the Define shell hydrates every tab
   * from. Tabs-builder added this for the Financials tab; the shell
   * uses it for the page-level project metadata + identity baseline.
   */
  get: (projectId: string) =>
    api.get<ProjectDefineResponse>(`/api/projects/${projectId}/define`),

  /** PUT /api/projects/{id}/identity — Identity tab Save. */
  updateIdentity: (projectId: string, body: ProjectIdentityUpdate) =>
    api.put<ProjectDefineResponse>(
      `/api/projects/${projectId}/identity`,
      body,
    ),

  /** PUT /api/projects/{id}/approval-milestones — Approval tab Save. */
  updateApprovalMilestones: (
    projectId: string,
    body: ProjectApprovalMilestonesUpdate,
  ) =>
    api.put<ProjectDefineResponse>(
      `/api/projects/${projectId}/approval-milestones`,
      body,
    ),

  /**
   * PUT /api/projects/{id}/baseline-grid — Financials tab Save.
   *
   * Quick-sizing block (`total_budget` + `capex_opex`) and the optional
   * baseline grid (`rows`) ride on the same body; either may be supplied
   * independently. The response carries the refreshed project AND the
   * hydrated baseline grid so the tab can re-render without a second
   * round-trip.
   */
  updateFinancials: (projectId: string, body: ProjectFinancialsUpdate) =>
    api.put<ProjectFinancialsSaveResponse>(
      `/api/projects/${projectId}/baseline-grid`,
      body,
    ),
};
