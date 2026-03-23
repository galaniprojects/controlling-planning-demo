import { api } from './client';
import type {
  RoleInfo,
  RoleContext,
  Notification,
  PendingAction,
  PortfolioKPISummary,
  ModuleTile,
  ListResponse,
  PortfolioKPIs,
  ProjectTreeNode,
  ProjectSummary,
  ChartData,
  IntakeItem,
  IntakeDetail,
  ApprovalItem,
  CRDetail,
  LoBRef,
  WorkbenchProjectListItem,
  ProjectOverview,
  ForecastGridRow,
  ForecastCycleStartResponse,
  SuggestionItem,
  ForecastChange,
  ReviewGroup,
  CostCentreGroup,
  SubmittedCR,
  CRHistoryItem,
  TimelineData,
  CapacityContext,
  TeamSummary,
  RoleHeatmapRow,
  PersonDetail,
  CapacityRequestItem,
  AssignmentPreview,
  OrgSummary,
  OrgHeatmapRow,
  OrgDetailItem,
  OrgDetailResponse,
  ScenarioListResponse,
  ScenarioCreateResponse,
  ScenarioDetail,
  ScenarioMetadataUpdateResponse,
  ScenarioStatusResponse,
  AdvisorQueryResponse,
  ComparisonResponse,
  DrillDownResponse,
  AdminContext,
  RefCostCenter,
  RefCompetenceCenter,
  RefLocation,
  RefRole,
  RefPerson,
  AdminRateEntry,
  AdminParameter,
  AuditLogEntry,
  FAQSummary,
  FAQDetail,
  ReportListItem,
  SavedViewItem,
  ProgrammeRollupResponse,
  CCFinancialResponse,
  VendorSpendResponse,
  VendorDrillDownRow,
  ForecastAccuracyResponse,
  YoYResponse,
} from '@/types/api';

export const rolesApi = {
  getAll: () => api.get<ListResponse<RoleInfo>>('/api/roles'),
  getContext: (roleId: string) => api.get<RoleContext>(`/api/roles/${roleId}/context`),
};

export const notificationsApi = {
  getAll: () => api.get<ListResponse<Notification>>('/api/notifications'),
};

export const kpisApi = {
  getPortfolioSummary: () => api.get<PortfolioKPISummary>('/api/kpis/portfolio-summary'),
};

export const modulesApi = {
  getAll: () => api.get<ListResponse<ModuleTile>>('/api/modules'),
};

export const launchpadApi = {
  getPendingActions: () =>
    api.get<ListResponse<PendingAction>>('/api/launchpad/pending-actions'),
  createProject: (data: {
    name: string;
    description?: string;
    lob_id: string;
    start_month: string;
    end_month?: string;
    capex_opex?: string;
  }) =>
    api.post<{ id: string; name: string; status: string; estimated_cost: number }>(
      '/api/launchpad/projects',
      data,
    ),
  submitProject: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/launchpad/projects/${projectId}/submit`,
    ),
};

// --- Portfolio Overview ---

export const portfolioApi = {
  // Dashboard
  getKPIs: (params?: { lob?: string; status?: string; rag?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.lob) query.set('lob', params.lob);
    if (params?.status) query.set('status', params.status);
    if (params?.rag) query.set('rag', params.rag);
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    return api.get<PortfolioKPIs>(`/api/portfolio/kpis${qs ? '?' + qs : ''}`);
  },
  getProjects: (params?: { lob?: string; status?: string; rag?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.lob) query.set('lob', params.lob);
    if (params?.status) query.set('status', params.status);
    if (params?.rag) query.set('rag', params.rag);
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    return api.get<ListResponse<ProjectTreeNode>>(`/api/portfolio/projects${qs ? '?' + qs : ''}`);
  },
  getProjectSummary: (projectId: string) =>
    api.get<ProjectSummary>(`/api/portfolio/projects/${projectId}/summary`),
  getCharts: (filters?: Record<string, string>) => {
    const query = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v) query.set(k, v);
      }
    }
    const qs = query.toString();
    return api.get<ChartData>(`/api/portfolio/charts${qs ? '?' + qs : ''}`);
  },

  // Intake
  getIntake: () => api.get<ListResponse<IntakeItem>>('/api/portfolio/intake'),
  getIntakeDetail: (projectId: string) =>
    api.get<IntakeDetail>(`/api/portfolio/intake/${projectId}`),
  approveIntake: (projectId: string, comments?: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/approve`,
      comments ? { comments } : {}
    ),
  rejectIntake: (projectId: string, reason: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/reject`,
      { reason }
    ),
  sendBackIntake: (projectId: string, comments: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/send-back`,
      { comments }
    ),
  resubmitIntake: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/resubmit`,
      {}
    ),

  // Approvals
  getApprovals: () => api.get<ListResponse<ApprovalItem>>('/api/portfolio/approvals'),
  getApprovalDetail: (crId: number) =>
    api.get<CRDetail>(`/api/portfolio/approvals/${crId}`),
  approveCR: (crId: number, comments?: string) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/approve`, comments ? { comments } : {}),
  rejectCR: (crId: number, reason: string) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/reject`, { reason }),
  sendBackCR: (crId: number, comments: string) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/send-back`, { comments }),
};

// --- Reference Data ---

export const referenceApi = {
  getLobs: () => api.get<ListResponse<LoBRef>>('/api/reference/lobs'),
  getCostCenters: () => api.get<ListResponse<RefCostCenter>>('/api/reference/cost-centers'),
  getCompetenceCenters: () => api.get<ListResponse<RefCompetenceCenter>>('/api/reference/competence-centers'),
  getLocations: () => api.get<ListResponse<RefLocation>>('/api/reference/locations'),
  getRoles: () => api.get<ListResponse<RefRole>>('/api/reference/roles'),
  getPeople: () => api.get<ListResponse<RefPerson>>('/api/reference/people'),
  getCostTypes: () => api.get<ListResponse<{ id: string; name: string }>>('/api/reference/cost-types'),
};

// --- Documentation ---

export interface ModuleManualSection {
  title: string;
  body: string;
}

export interface ModuleManual {
  module_id: string;
  module_name: string;
  sections: ModuleManualSection[];
}

export const docsApi = {
  getModuleManual: (moduleId: string) =>
    api.get<ModuleManual>(`/api/docs/modules/${moduleId}`),
  getFAQs: () => api.get<ListResponse<FAQSummary>>('/api/docs/faq'),
  getFAQDetail: (faqId: string) => api.get<FAQDetail>(`/api/docs/faq/${faqId}`),
};

// --- Project Workbench ---

export const workbenchApi = {
  // Project list (left panel)
  getProjects: () =>
    api.get<ListResponse<WorkbenchProjectListItem>>('/api/projects'),

  // Overview tab
  getOverview: (projectId: string) =>
    api.get<ProjectOverview>(`/api/projects/${projectId}/overview`),

  // Timeline visualization
  getTimeline: (projectId: string) =>
    api.get<TimelineData>(`/api/projects/${projectId}/timeline`),

  // Forecast grid (read mode)
  getForecast: (projectId: string) =>
    api.get<ListResponse<ForecastGridRow>>(`/api/projects/${projectId}/forecast`),

  // Forecast cycle (5-phase wizard)
  startCycle: (projectId: string) =>
    api.post<ForecastCycleStartResponse>(
      `/api/projects/${projectId}/forecast-cycle/start`,
      {},
    ),
  acknowledgeRetrospective: (
    projectId: string,
    cycleId: string,
    explanations: Record<string, string>,
  ) =>
    api.put<{ status: string; phase: number }>(
      `/api/projects/${projectId}/forecast-cycle/${cycleId}/acknowledge`,
      { explanations },
    ),
  getSuggestions: (projectId: string, cycleId: string) =>
    api.get<ListResponse<SuggestionItem>>(
      `/api/projects/${projectId}/forecast-cycle/${cycleId}/suggestions`,
    ),
  saveEdits: (
    projectId: string,
    cycleId: string,
    changes: ForecastChange[],
    appliedSuggestionIds: number[],
  ) =>
    api.put<{ status: string; total_changes: number; phase: number }>(
      `/api/projects/${projectId}/forecast-cycle/${cycleId}/edit`,
      { changes, applied_suggestion_ids: appliedSuggestionIds },
    ),
  getReview: (projectId: string, cycleId: string) =>
    api.get<ListResponse<ReviewGroup>>(
      `/api/projects/${projectId}/forecast-cycle/${cycleId}/review`,
    ),
  submitCycle: (projectId: string, cycleId: string, groups: ReviewGroup[], costCentreGroups?: CostCentreGroup[]) =>
    api.put<ListResponse<SubmittedCR>>(
      `/api/projects/${projectId}/forecast-cycle/${cycleId}/submit`,
      { groups, cost_centre_groups: costCentreGroups },
    ),

  // Change history
  getChangeRequests: (
    projectId: string,
    params?: { category?: string; status?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api.get<ListResponse<CRHistoryItem>>(
      `/api/projects/${projectId}/change-requests${qs ? '?' + qs : ''}`,
    );
  },
  getChangeRequestDetail: (projectId: string, crId: number) =>
    api.get<CRHistoryItem>(
      `/api/projects/${projectId}/change-requests/${crId}`,
    ),
  getCRDetailView: (projectId: string, crId: number) =>
    api.get<{
      cr_id: number;
      project_id: string;
      project_name: string;
      summary: string;
      status: string;
      change_category: string;
      justification: string | null;
      is_system_suggested: boolean;
      submitted_by: string;
      submission_date: string;
      decided_by: string | null;
      decided_date: string | null;
      grid_data: import('@/lib/detailViewTypes').DetailViewGridData | null;
    }>(`/api/projects/${projectId}/change-requests/${crId}/detail-view`),
};

// --- Capacity Management ---

export const capacityApi = {
  // Context
  getContext: () => api.get<CapacityContext>('/api/capacity/context'),

  // My Team
  getTeamSummary: (ccId: string) =>
    api.get<TeamSummary>(`/api/capacity/my-team/${ccId}/summary`),
  getTeamHeatmap: (ccId: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from_month', from);
    if (to) q.set('to_month', to);
    const qs = q.toString();
    return api.get<ListResponse<RoleHeatmapRow>>(
      `/api/capacity/my-team/${ccId}/heatmap${qs ? '?' + qs : ''}`,
    );
  },
  getPersonDetail: (ccId: string, personId: string) =>
    api.get<PersonDetail>(
      `/api/capacity/my-team/${ccId}/people/${personId}/detail`,
    ),

  // Requests
  getRequests: (ccId: string) =>
    api.get<ListResponse<CapacityRequestItem>>(
      `/api/capacity/requests/${ccId}`,
    ),
  getRequestDetail: (ccId: string, reqId: number) =>
    api.get<CapacityRequestItem>(
      `/api/capacity/requests/${ccId}/${reqId}`,
    ),
  getAssignmentPreview: (ccId: string, reqId: number, personId: string) =>
    api.get<AssignmentPreview>(
      `/api/capacity/requests/${ccId}/${reqId}/assignment-preview?person_id=${personId}`,
    ),
  confirmRequest: (ccId: string, reqId: number, assignedPersonId?: string) =>
    api.put<CapacityRequestItem>(
      `/api/capacity/requests/${ccId}/${reqId}/confirm`,
      { assigned_person_id: assignedPersonId ?? null },
    ),
  partiallyFulfill: (
    ccId: string,
    reqId: number,
    adjustedValue: number,
    assignedPersonId?: string,
  ) =>
    api.put<CapacityRequestItem>(
      `/api/capacity/requests/${ccId}/${reqId}/partially-fulfill`,
      { adjusted_value: adjustedValue, assigned_person_id: assignedPersonId ?? null },
    ),
  counterPropose: (ccId: string, reqId: number, explanation: string) =>
    api.put<CapacityRequestItem>(
      `/api/capacity/requests/${ccId}/${reqId}/counter-propose`,
      { explanation, alternative_resource_plan: [] },
    ),
  declineRequest: (ccId: string, reqId: number, reason: string) =>
    api.put<CapacityRequestItem>(
      `/api/capacity/requests/${ccId}/${reqId}/decline`,
      { reason },
    ),

  // Org Overview
  getOrgSummary: () => api.get<OrgSummary>('/api/capacity/org/summary'),
  getOrgHeatmap: (pivot: string, from?: string, to?: string) => {
    const q = new URLSearchParams({ pivot });
    if (from) q.set('from_month', from);
    if (to) q.set('to_month', to);
    return api.get<ListResponse<OrgHeatmapRow>>(
      `/api/capacity/org/heatmap?${q}`,
    );
  },
  getOrgHeatmapDetail: (dimId: string, pivot: string, month?: string) => {
    const q = new URLSearchParams({ pivot });
    if (month) q.set('month', month);
    return api.get<OrgDetailResponse>(
      `/api/capacity/org/heatmap/${dimId}/detail?${q}`,
    );
  },
};

// --- What-If Simulator ---

export const scenariosApi = {
  // Scenario Manager
  list: () => api.get<ScenarioListResponse>('/api/scenarios'),

  create: (body: { name: string; description?: string; clone_from?: number }) =>
    api.post<ScenarioCreateResponse>('/api/scenarios', body),

  remove: (scenarioId: number) =>
    api.delete<{ status: string }>(`/api/scenarios/${scenarioId}`),

  publish: (scenarioId: number) =>
    api.put<ScenarioStatusResponse>(`/api/scenarios/${scenarioId}/publish`),

  unpublish: (scenarioId: number) =>
    api.put<ScenarioStatusResponse>(`/api/scenarios/${scenarioId}/unpublish`),

  // Workspace
  getDetail: (scenarioId: number) =>
    api.get<ScenarioDetail>(`/api/scenarios/${scenarioId}`),

  updateMetadata: (
    scenarioId: number,
    body: { name?: string; description?: string },
  ) =>
    api.put<ScenarioMetadataUpdateResponse>(
      `/api/scenarios/${scenarioId}/metadata`,
      body,
    ),

  applyAction: (
    scenarioId: number,
    body: {
      scope: string;
      action_type: string;
      project_id?: string;
      parameters: Record<string, unknown>;
    },
  ) => api.post<ScenarioDetail>(`/api/scenarios/${scenarioId}/actions`, body),

  removeAction: (scenarioId: number, actionId: number) =>
    api.delete<ScenarioDetail>(
      `/api/scenarios/${scenarioId}/actions/${actionId}`,
    ),

  reorderActions: (scenarioId: number, actionIds: number[]) =>
    api.put<{ status: string }>(
      `/api/scenarios/${scenarioId}/actions/reorder`,
      { action_ids: actionIds },
    ),

  // D4b: AI Advisor
  advisorQuery: (scenarioId: number, goal: string) =>
    api.post<AdvisorQueryResponse>(
      `/api/scenarios/${scenarioId}/advisor/query`,
      { goal },
    ),

  advisorApply: (scenarioId: number, pathId: string) =>
    api.post<ScenarioDetail>(
      `/api/scenarios/${scenarioId}/advisor/apply`,
      { path_id: pathId },
    ),

  // D4b: Comparison & Drill-Down
  compare: (scenarioIds: number[]) =>
    api.post<ComparisonResponse>('/api/scenarios/compare', {
      scenario_ids: scenarioIds,
    }),

  drillDown: (scenarioId: number, level: string, parentId?: string) => {
    const q = new URLSearchParams({ level });
    if (parentId) q.set('parent_id', parentId);
    return api.get<DrillDownResponse>(
      `/api/scenarios/${scenarioId}/drill-down?${q}`,
    );
  },
};

// --- Administration ---

export const adminApi = {
  getContext: () => api.get<AdminContext>('/api/admin/context'),

  // Cost Centers
  createCostCenter: (data: { name: string; location_id: string; competence_center_id: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/cost-centers', data),
  updateCostCenter: (id: string, data: { name?: string; location_id?: string; competence_center_id?: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/cost-centers/${id}`, data),
  deactivateCostCenter: (id: string) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/cost-centers/${id}/deactivate`),

  // Competence Centers
  createCompetenceCenter: (data: { name: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/competence-centers', data),
  updateCompetenceCenter: (id: string, data: { name?: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/competence-centers/${id}`, data),

  // Lines of Business
  createLoB: (data: { name: string; description?: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/lobs', data),
  updateLoB: (id: string, data: { name?: string; description?: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/lobs/${id}`, data),

  // Locations
  createLocation: (data: { city: string; country: string }) =>
    api.post<{ id: string; city: string; country: string; is_active: boolean }>('/api/admin/locations', data),
  updateLocation: (id: string, data: { city?: string; country?: string }) =>
    api.put<{ id: string; city: string; country: string; is_active: boolean }>(`/api/admin/locations/${id}`, data),

  // People
  createPerson: (data: { name: string; role_type_id: string; cost_center_id?: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/people', data),
  updatePerson: (id: string, data: { name?: string; role_type_id?: string; cost_center_id?: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/people/${id}`, data),
  deactivatePerson: (id: string) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/people/${id}/deactivate`),

  // Rate Tables
  getRates: () =>
    api.get<ListResponse<AdminRateEntry>>('/api/admin/rates'),
  updateRates: (changes: { role_type_id: string; competence_center_id: string; new_rate: number; effective_date: string }[]) =>
    api.put<ListResponse<{ role_type_id: string; competence_center_id: string; new_rate: number; effective_date: string }>>('/api/admin/rates', { changes }),

  // Planning Parameters
  getParameters: () =>
    api.get<ListResponse<AdminParameter>>('/api/admin/parameters'),
  updateParameters: (changes: { key: string; new_value: string }[]) =>
    api.put<ListResponse<{ key: string; name: string; current_value: string }>>('/api/admin/parameters', { changes }),
  resetParameters: (keys?: string[]) =>
    api.post<ListResponse<{ key: string; name: string; current_value: string }>>('/api/admin/parameters/reset', { keys: keys ?? null }),

  // Audit Log
  getAuditLog: (entityType?: string, limit?: number) => {
    const q = new URLSearchParams();
    if (entityType) q.set('entity_type', entityType);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return api.get<ListResponse<AuditLogEntry>>(`/api/admin/audit-log${qs ? '?' + qs : ''}`);
  },

  // Demo Reset
  resetDemo: () =>
    api.post<{ status: string; message: string }>('/api/admin/reset-demo', {}),
};

// --- Reporting ---

export const reportsApi = {
  getReportList: () =>
    api.get<ListResponse<ReportListItem>>('/api/reports'),

  getProgrammeRollup: (params?: { lob?: string; status?: string; rag?: string; type?: string; grouping?: string; fiscal_year?: string; project_ids?: string }) => {
    const q = new URLSearchParams();
    if (params?.lob) q.set('lob', params.lob);
    if (params?.status) q.set('status', params.status);
    if (params?.rag) q.set('rag', params.rag);
    if (params?.type) q.set('type', params.type);
    if (params?.grouping) q.set('grouping', params.grouping);
    if (params?.fiscal_year) q.set('fiscal_year', params.fiscal_year);
    if (params?.project_ids) q.set('project_ids', params.project_ids);
    const qs = q.toString();
    return api.get<ProgrammeRollupResponse>(`/api/reports/programme-rollup${qs ? '?' + qs : ''}`);
  },

  // RPT-03: Custom project groups
  getCustomGroups: () =>
    api.get<{ items: { id: number; name: string; project_ids: string[] }[]; total: number }>('/api/reports/custom-groups'),

  createCustomGroup: (body: { name: string; config: Record<string, unknown> }) =>
    api.post<{ id: number; name: string; project_ids: string[] }>('/api/reports/custom-groups', {
      report_id: 'custom-group',
      ...body,
    }),

  deleteCustomGroup: (id: number) =>
    api.delete(`/api/reports/custom-groups/${id}`),

  getCCFinancialSummary: (params?: { cost_center?: string; type?: string; fiscal_year?: string }) => {
    const q = new URLSearchParams();
    if (params?.cost_center) q.set('cost_center', params.cost_center);
    if (params?.type) q.set('type', params.type);
    if (params?.fiscal_year) q.set('fiscal_year', params.fiscal_year);
    const qs = q.toString();
    return api.get<CCFinancialResponse>(`/api/reports/cc-financial-summary${qs ? '?' + qs : ''}`);
  },

  getVendorSpend: (params?: { vendor?: string; lob?: string; status?: string; fiscal_year?: string; expense_cost_type?: string }) => {
    const q = new URLSearchParams();
    if (params?.vendor) q.set('vendor', params.vendor);
    if (params?.lob) q.set('lob', params.lob);
    if (params?.status) q.set('status', params.status);
    if (params?.fiscal_year) q.set('fiscal_year', params.fiscal_year);
    if (params?.expense_cost_type) q.set('expense_cost_type', params.expense_cost_type);
    const qs = q.toString();
    return api.get<VendorSpendResponse>(`/api/reports/vendor-spend${qs ? '?' + qs : ''}`);
  },

  getVendorDrillDown: (vendorName: string) =>
    api.get<ListResponse<VendorDrillDownRow>>(`/api/reports/vendor-spend/${encodeURIComponent(vendorName)}/details`),

  getForecastAccuracy: (params?: { horizon?: string; lob?: string; type?: string; fiscal_year?: string }) => {
    const q = new URLSearchParams();
    if (params?.horizon) q.set('horizon', params.horizon);
    if (params?.lob) q.set('lob', params.lob);
    if (params?.type) q.set('type', params.type);
    if (params?.fiscal_year) q.set('fiscal_year', params.fiscal_year);
    const qs = q.toString();
    return api.get<ForecastAccuracyResponse>(`/api/reports/forecast-accuracy${qs ? '?' + qs : ''}`);
  },

  getYearOverYear: (params?: { fy_current?: string; fy_previous?: string; lob?: string; cost_type?: string; show_monthly?: string; months?: string }) => {
    const q = new URLSearchParams();
    if (params?.fy_current) q.set('fy_current', params.fy_current);
    if (params?.fy_previous) q.set('fy_previous', params.fy_previous);
    if (params?.lob) q.set('lob', params.lob);
    if (params?.cost_type) q.set('cost_type', params.cost_type);
    if (params?.show_monthly) q.set('show_monthly', params.show_monthly);
    if (params?.months) q.set('months', params.months);
    const qs = q.toString();
    return api.get<YoYResponse>(`/api/reports/year-over-year${qs ? '?' + qs : ''}`);
  },

  getSavedViews: () =>
    api.get<ListResponse<SavedViewItem>>('/api/reports/saved-views'),

  createSavedView: (data: { report_id: string; name: string; config: Record<string, unknown> }) =>
    api.post<SavedViewItem>('/api/reports/saved-views', data),

  updateSavedView: (viewId: number, data: { name?: string; config?: Record<string, unknown> }) =>
    api.put<SavedViewItem>(`/api/reports/saved-views/${viewId}`, data),

  deleteSavedView: (viewId: number) =>
    api.delete<{ status: string }>(`/api/reports/saved-views/${viewId}`),

  exportReport: (reportId: string) =>
    `/api/reports/${reportId}/export`,
};
