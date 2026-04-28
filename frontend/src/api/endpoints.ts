import { api } from './client';
import type {
  RoleTypeItem,
  ExternalCostTypeItem,
  ProjectDependencyItem,
  UserItem,
  RolePermissionGrantItem,
  CountryItem,
  RegionItem,
  ChargingLocationItem,
  LegalEntityItem,
  UMVersionItem,
  UMCellItem,
  UMRefreshStatus,
  UMImportResult,
  WorkflowTemplateSummary,
  WorkflowTemplateDetail,
  WorkflowStepItem,
  ScheduledChangeItem,
  ApplyScheduledChangesSummary,
  AuditCategoryRef,
  AuditLogResponse,
  AuditEntryV2,
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
  MonthlyHoursItem,
  RequestAssignment,
  ProjectAssignmentDetail,
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
  AIBuilderStatus,
  AIConversationReply,
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
      '/api/projects',
      data,
    ),
  submitProject: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/projects/${projectId}/submit`,
    ),
  getProjectDraft: (projectId: string) =>
    api.get<{
      id: string; name: string; description: string | null;
      lob_id: string; lob_name: string;
      start_month: string; end_month: string | null;
      status: string; capex_opex: string;
      submission_feedback: string | null;
    }>(`/api/projects/${projectId}`),
  getProjectForecast: (projectId: string) =>
    api.get<{
      months: string[];
      rows: Array<{
        id: string; name: string; category: string; sub_category: string;
        unit: string; rate: number;
        months: Array<{ month: string; value: number; value_eur: number }>;
        total: number; total_eur: number;
      }>;
    }>(`/api/projects/${projectId}/resource-plan`),
};

// --- Portfolio Overview ---

export const portfolioApi = {
  // Dashboard
  getKPIs: (params?: { lob?: string; grouping_entity?: string; status?: string; rag?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.grouping_entity) query.set('grouping_entity', params.grouping_entity);
    else if (params?.lob) query.set('lob', params.lob);
    if (params?.status) query.set('status', params.status);
    if (params?.rag) query.set('rag', params.rag);
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    return api.get<PortfolioKPIs>(`/api/portfolio/kpis${qs ? '?' + qs : ''}`);
  },
  getProjects: (params?: { lob?: string; grouping_entity?: string; status?: string; rag?: string; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.grouping_entity) query.set('grouping_entity', params.grouping_entity);
    else if (params?.lob) query.set('lob', params.lob);
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
  sendBackIntake: (projectId: string, comments: string, changes?: Array<{
    category: string; sub_category: string; month: string;
    hours: number | null; amount_eur: number;
  }>) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/send-back`,
      { comments, changes: changes || [] }
    ),
  resubmitIntake: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/resubmit`,
      {}
    ),
  getIntakeDiff: (projectId: string) =>
    api.get<{
      project_name: string;
      submission_feedback: string | null;
      grid_data: import('@/types/api').DetailViewGridDataResponse;
    }>(`/api/portfolio/intake/${projectId}/diff`),
  acceptChanges: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/portfolio/intake/${projectId}/accept-changes`
    ),
  getEditableGrid: (projectId: string) =>
    api.get<{
      months: string[];
      rows: Array<{
        id: string; name: string; category: string; sub_category: string;
        unit: string;
        months: Array<{ month: string; value: number; value_eur: number }>;
        total: number; total_eur: number;
      }>;
    }>(`/api/portfolio/intake/${projectId}/editable-grid`),

  // Approvals
  getApprovals: () => api.get<ListResponse<ApprovalItem>>('/api/portfolio/approvals'),
  getApprovalDetail: (crId: number) =>
    api.get<CRDetail>(`/api/portfolio/approvals/${crId}`),
  approveCR: (crId: number, comments?: string) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/approve`, comments ? { comments } : {}),
  rejectCR: (crId: number, reason: string) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/reject`, { reason }),
  sendBackCR: (crId: number, comments: string, changes?: Array<{
    category: string; sub_category: string; month: string;
    hours: number | null; amount_eur: number;
  }>) =>
    api.put<CRDetail>(`/api/portfolio/approvals/${crId}/send-back`, { comments, changes: changes || [] }),
  getCREditableGrid: (crId: number) =>
    api.get<{ months: string[]; rows: Array<{
      id: string; name: string; category: string; sub_category: string;
      unit: string; months: Array<{ month: string; value: number; value_eur: number }>;
      total: number; total_eur: number;
    }> }>(`/api/portfolio/approvals/${crId}/editable-grid`),
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
  getAllModuleManuals: () =>
    api.get<ListResponse<ModuleManual>>('/api/docs/modules/all'),
  getFAQs: () => api.get<ListResponse<FAQSummary>>('/api/docs/faq'),
  getFAQDetail: (faqId: string) => api.get<FAQDetail>(`/api/docs/faq/${faqId}`),
  getAllFAQs: () => api.get<ListResponse<FAQDetail>>('/api/docs/faq/all'),
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
  getCRDiff: (projectId: string, crId: number) =>
    api.get<{
      cr_id: number;
      project_id: string;
      project_name: string;
      controller_feedback: string | null;
      grid_data: {
        months: string[];
        line_items: Array<{
          id: string; name: string; category: string; unit: string;
          months: Array<{
            month: string; proposed: number; proposed_eur: number;
            current: number; current_eur: number; is_changed: boolean;
          }>;
          current_total: number; proposed_total: number;
          current_total_eur: number; proposed_total_eur: number;
        }>;
        kpis: Array<{ label: string; value: number; format: string; color?: string }>;
      };
    }>(`/api/projects/${projectId}/change-requests/${crId}/diff`),
  acceptCRChanges: (projectId: string, crId: number) =>
    api.put<{ status: string; message: string }>(
      `/api/projects/${projectId}/change-requests/${crId}/accept-changes`,
    ),
  resubmitCR: (projectId: string, crId: number) =>
    api.put<{ status: string; message: string }>(
      `/api/projects/${projectId}/change-requests/${crId}/resubmit`,
    ),
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

  // Monthly Hours & Assignments
  getRequestMonthlyHours: (ccId: string, reqId: number) =>
    api.get<ListResponse<MonthlyHoursItem>>(
      `/api/capacity/requests/${ccId}/${reqId}/monthly-hours`,
    ),
  getRequestAssignments: (ccId: string, reqId: number) =>
    api.get<ListResponse<RequestAssignment>>(
      `/api/capacity/requests/${ccId}/${reqId}/assignments`,
    ),
  saveRequestAssignments: (
    ccId: string,
    reqId: number,
    assignments: { month: string; person_id: string }[],
  ) =>
    api.put<ListResponse<RequestAssignment>>(
      `/api/capacity/requests/${ccId}/${reqId}/assignments`,
      { assignments },
    ),

  // Project Assignment Detail
  getProjectAssignmentDetail: (projectId: string, crId?: number) =>
    api.get<ProjectAssignmentDetail>(
      `/api/capacity/project-assignment/${projectId}${crId != null ? `?cr=${crId}` : ''}`,
    ),

  // Project-Level Confirmation (includes both projects and change requests)
  getPendingProjectConfirmations: () =>
    api.get<ListResponse<{
      id: string; type: 'project' | 'change_request'; name: string;
      lob_name: string; pl_name: string | null;
      start_month: string; end_month: string | null;
      resource_request_count: number; submitted_at: string | null;
      cr_id?: number; cr_summary?: string;
    }>>('/api/capacity/project-confirmation/pending'),
  confirmProject: (projectId: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/capacity/project-confirmation/${projectId}/confirm`,
    ),
  declineProject: (projectId: string, reason: string) =>
    api.put<{ id: string; name: string; status: string }>(
      `/api/capacity/project-confirmation/${projectId}/decline`,
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
  getCompetenceCenterPeople: (ccId: string) =>
    api.get<ListResponse<{ id: string; name: string; role_name: string; cost_center_name: string }>>(`/api/admin/competence-centers/${ccId}/people`),
  assignPersonToCC: (ccId: string, personId: string) =>
    api.put<{ status: string }>(`/api/admin/competence-centers/${ccId}/people/${personId}/assign`),
  unassignPersonFromCC: (ccId: string, personId: string) =>
    api.put<{ status: string }>(`/api/admin/competence-centers/${ccId}/people/${personId}/unassign`),

  // Lines of Business
  createLoB: (data: { name: string; description?: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/lobs', data),
  updateLoB: (id: string, data: { name?: string; description?: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/lobs/${id}`, data),
  getLoBProjects: (lobId: string) =>
    api.get<ListResponse<{ id: string; name: string; status: string; total_budget: number }>>(`/api/admin/lobs/${lobId}/projects`),
  assignProjectToLoB: (lobId: string, projectId: string) =>
    api.put<{ status: string; old_lob_name: string }>(`/api/admin/lobs/${lobId}/projects/${projectId}/assign`),

  // Locations
  createLocation: (data: { city: string; country: string }) =>
    api.post<{ id: string; city: string; country: string; is_active: boolean }>('/api/admin/locations', data),
  updateLocation: (id: string, data: { city?: string; country?: string }) =>
    api.put<{ id: string; city: string; country: string; is_active: boolean }>(`/api/admin/locations/${id}`, data),

  // People
  createPerson: (data: { name: string; role_type_id: string; cost_center_id?: string; competence_center_id?: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/people', data),
  updatePerson: (id: string, data: { name?: string; role_type_id?: string; cost_center_id?: string; competence_center_id?: string }) =>
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

  // Grouping Hierarchy (ADM-01)
  getEntityTypes: () =>
    api.get<ListResponse<{ id: string; name: string; is_active: boolean; entity_count: number }>>('/api/admin/grouping/entity-types'),
  createEntityType: (data: { name: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/grouping/entity-types', data),
  updateEntityType: (id: string, data: { name: string }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/grouping/entity-types/${id}`, data),
  getGroupingEntities: (typeId?: string) =>
    api.get<ListResponse<{ id: string; entity_type_id: string; entity_type_name: string; name: string; parent_entity_id: string | null; is_active: boolean; project_count: number }>>(`/api/admin/grouping/entities${typeId ? `?type_id=${typeId}` : ''}`),
  createGroupingEntity: (data: { entity_type_id: string; name: string; parent_entity_id?: string }) =>
    api.post<{ id: string; name: string; is_active: boolean }>('/api/admin/grouping/entities', data),
  updateGroupingEntity: (id: string, data: { name?: string; parent_entity_id?: string | null }) =>
    api.put<{ id: string; name: string; is_active: boolean }>(`/api/admin/grouping/entities/${id}`, data),
  getHierarchies: () =>
    api.get<ListResponse<{ id: string; name: string; is_active_hierarchy: boolean; levels: { level_order: number; entity_type_id: string; entity_type_name: string }[] }>>('/api/admin/grouping/hierarchies'),
  createHierarchy: (data: { name: string; levels: string[] }) =>
    api.post<{ id: string; name: string; is_active_hierarchy: boolean }>('/api/admin/grouping/hierarchies', data),
  updateHierarchy: (id: string, data: { name?: string; levels?: string[] }) =>
    api.put<{ id: string; name: string; is_active_hierarchy: boolean }>(`/api/admin/grouping/hierarchies/${id}`, data),
  activateHierarchy: (id: string) =>
    api.put<{ id: string; name: string; is_active_hierarchy: boolean }>(`/api/admin/grouping/hierarchies/${id}/activate`),
  getActiveHierarchy: () =>
    api.get<{ hierarchy: { id: string; name: string } | null; levels: { level_order: number; entity_type_id: string; entity_type_name: string }[]; top_level_label: string; entities: { id: string; name: string; entity_type_id: string; project_count: number; children: unknown[]; projects: { id: string; name: string; status: string }[] }[] }>('/api/admin/grouping/active-hierarchy'),
  assignProjectToEntity: (data: { project_id: string; grouping_entity_id: string }) =>
    api.post<{ status: string }>('/api/admin/grouping/project-assignments', data),
  unassignProjectFromEntity: (projectId: string) =>
    api.delete<{ status: string }>(`/api/admin/grouping/project-assignments/${projectId}`),
  getEntityProjects: (entityId: string) =>
    api.get<ListResponse<{ id: string; name: string; status: string; total_budget: number }>>(`/api/admin/grouping/entities/${entityId}/projects`),
  assignEntityParent: (entityId: string, parentEntityId: string | null) =>
    api.put<{ id: string; name: string; parent_entity_id: string | null }>(`/api/admin/grouping/entities/${entityId}/parent`, { parent_entity_id: parentEntityId }),

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

// --- AI Report Builder ---

export const aiReportBuilderApi = {
  getStatus: () =>
    api.get<AIBuilderStatus>('/api/reports/ai-builder/status'),

  startConversation: (initialMessage: string) =>
    api.post<AIConversationReply>('/api/reports/ai-builder/conversations', {
      initial_message: initialMessage,
    }),

  sendMessage: (conversationId: string, message: string) =>
    api.post<AIConversationReply>(
      `/api/reports/ai-builder/conversations/${conversationId}/messages`,
      { message },
    ),

  deleteConversation: (conversationId: string) =>
    api.delete<{ status: string }>(
      `/api/reports/ai-builder/conversations/${conversationId}`,
    ),
};

// ---------------------------------------------------------------------------
// Report Builder
// ---------------------------------------------------------------------------

import type {
  CatalogResponse,
  ReportExecuteRequest,
  ReportExecuteResponse,
  FilterValuesResponse,
  ReportDefinition,
  SavedReportDetail,
  SavedReportSummary,
  SharedReportSummary,
} from '@/types/reportBuilder';

export const reportBuilderApi = {
  getCatalog: () =>
    api.get<CatalogResponse>('/api/report-builder/catalog'),

  execute: (body: ReportExecuteRequest) =>
    api.post<ReportExecuteResponse>('/api/report-builder/execute', body),

  getFilterValues: (dimensionId: string) =>
    api.get<FilterValuesResponse>(`/api/report-builder/filter-values/${dimensionId}`),

  // Saved reports
  listSaved: () =>
    api.get<{ items: SavedReportSummary[]; total: number }>('/api/report-builder/saved'),

  getSaved: (id: number) =>
    api.get<SavedReportDetail>(`/api/report-builder/saved/${id}`),

  createSaved: (data: { name: string; description?: string; definition: ReportDefinition }) =>
    api.post<SavedReportDetail>('/api/report-builder/saved', data),

  updateSaved: (id: number, data: { name?: string; description?: string; definition?: ReportDefinition }) =>
    api.put<SavedReportDetail>(`/api/report-builder/saved/${id}`, data),

  deleteSaved: (id: number) =>
    api.delete<{ ok: boolean }>(`/api/report-builder/saved/${id}`),

  shareSaved: (id: number, data: { shares: { shared_with: string; permission: string }[]; is_published: boolean }) =>
    api.post<{ ok: boolean }>(`/api/report-builder/saved/${id}/share`, data),

  listShared: () =>
    api.get<{ items: SharedReportSummary[]; total: number }>('/api/report-builder/shared'),

};

// ---------------------------------------------------------------------------
// === Admin (D3) === — D1 + D2 + F1 admin surfaces consumed by frontend
// ---------------------------------------------------------------------------

export const adminD3Api = {
  // --- Reference Catalogues (D1) ---
  // Role Types
  getRoleTypes: () => api.get<ListResponse<RoleTypeItem>>('/api/admin/role-types'),
  createRoleType: (data: { name: string }) =>
    api.post<RoleTypeItem>('/api/admin/role-types', data),
  updateRoleType: (id: string, data: { name?: string }) =>
    api.put<RoleTypeItem>(`/api/admin/role-types/${id}`, data),

  // External Cost Types
  getExternalCostTypes: () =>
    api.get<ListResponse<ExternalCostTypeItem>>('/api/admin/external-cost-types'),
  createExternalCostType: (data: { name: string }) =>
    api.post<ExternalCostTypeItem>('/api/admin/external-cost-types', data),
  updateExternalCostType: (id: string, data: { name?: string }) =>
    api.put<ExternalCostTypeItem>(`/api/admin/external-cost-types/${id}`, data),

  // Project Dependencies
  getProjectDependencies: (projectId?: string) => {
    const q = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return api.get<ListResponse<ProjectDependencyItem>>(`/api/admin/project-dependencies${q}`);
  },
  createProjectDependency: (data: {
    predecessor_project_id: string;
    successor_project_id: string;
    dependency_type: string;
    lag_days?: number | null;
    notes?: string | null;
  }) =>
    api.post<ProjectDependencyItem>('/api/admin/project-dependencies', data),
  updateProjectDependency: (id: number, data: {
    dependency_type?: string;
    lag_days?: number | null;
    notes?: string | null;
  }) =>
    api.put<ProjectDependencyItem>(`/api/admin/project-dependencies/${id}`, data),
  deleteProjectDependency: (id: number) =>
    api.delete<{ status: string }>(`/api/admin/project-dependencies/${id}`),

  // --- Users (D1 / [D-AC-01..03]) ---
  getUsers: () => api.get<ListResponse<UserItem>>('/api/admin/users'),
  getUser: (id: string) => api.get<UserItem>(`/api/admin/users/${id}`),
  createUser: (data: {
    username: string;
    display_name: string;
    role: string;
    person_id?: string | null;
    tier3_flag?: boolean;
    change_reviewer_flag?: boolean;
  }) => api.post<UserItem>('/api/admin/users', data),
  updateUser: (id: string, data: {
    display_name?: string;
    role?: string;
    person_id?: string | null;
    tier3_flag?: boolean;
    change_reviewer_flag?: boolean;
  }) => api.put<UserItem>(`/api/admin/users/${id}`, data),
  deactivateUser: (id: string) =>
    api.put<UserItem>(`/api/admin/users/${id}/deactivate`),

  // --- Role Permissions Grid (F1 / [F-AC-01]) ---
  getRolePermissions: (params?: { role?: string; entity_type?: string }) => {
    const q = new URLSearchParams();
    if (params?.role) q.set('role', params.role);
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    const qs = q.toString();
    return api.get<ListResponse<RolePermissionGrantItem>>(
      `/api/admin/role-permissions${qs ? '?' + qs : ''}`,
    );
  },
  bulkUpsertRolePermissions: (grants: { role: string; entity_type: string; can_edit: boolean }[]) =>
    api.put<ListResponse<RolePermissionGrantItem>>('/api/admin/role-permissions/bulk', { grants }),

  // --- Charging Master Data (F1 / [F-MD-01..03]) ---
  // Countries
  getCountries: () => api.get<ListResponse<CountryItem>>('/api/admin/countries'),
  createCountry: (data: { iso_code: string; name: string }) =>
    api.post<CountryItem>('/api/admin/countries', data),
  updateCountry: (id: string, data: { iso_code?: string; name?: string }) =>
    api.put<CountryItem>(`/api/admin/countries/${id}`, data),
  deactivateCountry: (id: string) =>
    api.put<CountryItem>(`/api/admin/countries/${id}/deactivate`),

  // Regions
  getRegions: () => api.get<ListResponse<RegionItem>>('/api/admin/regions'),
  createRegion: (data: { code: string; name: string }) =>
    api.post<RegionItem>('/api/admin/regions', data),
  updateRegion: (id: string, data: { code?: string; name?: string }) =>
    api.put<RegionItem>(`/api/admin/regions/${id}`, data),
  deactivateRegion: (id: string) =>
    api.put<RegionItem>(`/api/admin/regions/${id}/deactivate`),

  // Charging Locations
  getChargingLocations: () =>
    api.get<ListResponse<ChargingLocationItem>>('/api/admin/charging-locations'),
  createChargingLocation: (data: {
    code: string;
    name: string;
    division?: string | null;
    region_id?: string | null;
    country_id?: string | null;
  }) => api.post<ChargingLocationItem>('/api/admin/charging-locations', data),
  updateChargingLocation: (id: string, data: {
    name?: string;
    division?: string | null;
    region_id?: string | null;
    country_id?: string | null;
  }) => api.put<ChargingLocationItem>(`/api/admin/charging-locations/${id}`, data),
  deactivateChargingLocation: (id: string) =>
    api.put<ChargingLocationItem>(`/api/admin/charging-locations/${id}/deactivate`),

  // Legal Entities
  getLegalEntities: (chargingLocationId?: string) => {
    const q = chargingLocationId
      ? `?charging_location_id=${encodeURIComponent(chargingLocationId)}`
      : '';
    return api.get<ListResponse<LegalEntityItem>>(`/api/admin/legal-entities${q}`);
  },
  createLegalEntity: (data: {
    code: string;
    name: string;
    charging_location_id?: string | null;
    country_id?: string | null;
  }) => api.post<LegalEntityItem>('/api/admin/legal-entities', data),
  updateLegalEntity: (id: string, data: {
    name?: string;
    charging_location_id?: string | null;
    country_id?: string | null;
  }) => api.put<LegalEntityItem>(`/api/admin/legal-entities/${id}`, data),
  deactivateLegalEntity: (id: string) =>
    api.put<LegalEntityItem>(`/api/admin/legal-entities/${id}/deactivate`),

  // --- User Measurement (F1 / [F-UM-01..04]) ---
  getUMRefreshStatus: () =>
    api.get<UMRefreshStatus>('/api/admin/user-measurement/refresh-status'),
  getUMVersions: () =>
    api.get<ListResponse<UMVersionItem>>('/api/admin/user-measurement/versions'),
  getUMCells: (params: { year: number; quarter: number; imported_at?: string }) => {
    const q = new URLSearchParams();
    q.set('year', String(params.year));
    q.set('quarter', String(params.quarter));
    if (params.imported_at) q.set('imported_at', params.imported_at);
    return api.get<{
      items: UMCellItem[];
      total: number;
      year: number;
      quarter: number;
      imported_at: string | null;
      source: string | null;
    }>(`/api/admin/user-measurement?${q.toString()}`);
  },
  importUMCsv: async (file: File): Promise<UMImportResult> => {
    const form = new FormData();
    form.append('file', file);
    // Use fetch directly for multipart upload with X-Current-User header
    const personaId = localStorage.getItem('currentRoleId') || 'persona-controller';
    const resp = await fetch('/api/admin/user-measurement/import', {
      method: 'POST',
      body: form,
      headers: { 'X-Current-User': personaId },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => 'Upload failed');
      throw new Error(text || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  // --- Workflow Templates (D2 / [D-CAT-07..10]) ---
  getWorkflowTemplates: () =>
    api.get<ListResponse<WorkflowTemplateSummary>>('/api/admin/workflow-templates'),
  getWorkflowTemplate: (idOrKey: string | number) =>
    api.get<WorkflowTemplateDetail>(`/api/admin/workflow-templates/${idOrKey}`),
  updateWorkflowStep: (
    templateIdOrKey: string | number,
    stepId: number,
    data: Partial<{
      required: boolean;
      skippable: boolean;
      assigned_role: string | null;
      data_gates: string[];
      notifications: Record<string, string[]> | null;
      time_constraint_days: number | null;
      escalation_action: string | null;
      is_active: boolean;
    }>,
  ) =>
    api.put<WorkflowStepItem>(
      `/api/admin/workflow-templates/${templateIdOrKey}/steps/${stepId}`,
      data,
    ),
  setWorkflowTemplateActive: (idOrKey: string | number, isActive: boolean) =>
    api.put<WorkflowTemplateSummary>(
      `/api/admin/workflow-templates/${idOrKey}/active`,
      { is_active: isActive },
    ),

  // --- Scheduled Changes (D2 / [D-NAV-06..07]) ---
  getScheduledChanges: (status?: string) => {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return api.get<ListResponse<ScheduledChangeItem>>(`/api/admin/scheduled-changes${q}`);
  },
  getScheduledChange: (id: number) =>
    api.get<ScheduledChangeItem>(`/api/admin/scheduled-changes/${id}`),
  createScheduledChange: (data: {
    entity_type: string;
    entity_id: string;
    description?: string | null;
    pending_values: Record<string, unknown>;
    activation_date: string;
  }) => api.post<ScheduledChangeItem>('/api/admin/scheduled-changes', data),
  approveScheduledChange: (id: number, comments?: string) =>
    api.post<ScheduledChangeItem>(
      `/api/admin/scheduled-changes/${id}/approve`,
      comments ? { comments } : {},
    ),
  rejectScheduledChange: (id: number, comments: string) =>
    api.post<ScheduledChangeItem>(
      `/api/admin/scheduled-changes/${id}/reject`,
      { comments },
    ),
  cancelScheduledChange: (id: number) =>
    api.post<ScheduledChangeItem>(`/api/admin/scheduled-changes/${id}/cancel`, {}),
  applyScheduledChanges: () =>
    api.post<ApplyScheduledChangesSummary>('/api/admin/apply-scheduled-changes', {}),

  // --- Audit Log V2 (D2 / [D-AC-09]) ---
  getAuditCategories: () =>
    api.get<ListResponse<AuditCategoryRef>>('/api/audit/categories'),
  queryAuditLog: (params?: {
    category?: string[];
    entity_type?: string;
    entity_id?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.category) {
      params.category.forEach((c) => q.append('category', c));
    }
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.entity_id) q.set('entity_id', params.entity_id);
    if (params?.user_id) q.set('user_id', params.user_id);
    if (params?.date_from) q.set('date_from', params.date_from);
    if (params?.date_to) q.set('date_to', params.date_to);
    if (params?.limit !== undefined) q.set('limit', String(params.limit));
    if (params?.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return api.get<AuditLogResponse>(`/api/audit/log${qs ? '?' + qs : ''}`);
  },
  getEntityAuditTrail: (entityType: string, entityId: string, limit?: number) => {
    const q = limit ? `?limit=${limit}` : '';
    return api.get<{ items: AuditEntryV2[]; total: number }>(
      `/api/audit/log/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}${q}`,
    );
  },
  // Returns the URL string — caller opens in a new tab / triggers download
  auditExportUrl: (params?: {
    format?: 'csv' | 'xlsx';
    category?: string[];
    entity_type?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('format', params?.format ?? 'csv');
    if (params?.category) params.category.forEach((c) => q.append('category', c));
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.user_id) q.set('user_id', params.user_id);
    if (params?.date_from) q.set('date_from', params.date_from);
    if (params?.date_to) q.set('date_to', params.date_to);
    return `/api/audit/export?${q.toString()}`;
  },
};
// === End Admin (D3) ===

