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
  TilesResponse,
  RoleAvailabilityResponse,
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
  MixedGridResponse,
  ForecastVersionMeta,
  ForecastVersionListResponse,
  ForecastVersionDetail,
  ForecastVersionDiff,
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
  // v5 E7 [E-06d-j] — role-personalised tile grid
  getTiles: () => api.get<TilesResponse>('/api/launchpad/tiles'),
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

export interface ChangelogSection {
  title: string;
  body: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  sections: ChangelogSection[];
}

export const docsApi = {
  getModuleManual: (moduleId: string) =>
    api.get<ModuleManual>(`/api/docs/modules/${moduleId}`),
  getAllModuleManuals: () =>
    api.get<ListResponse<ModuleManual>>('/api/docs/modules/all'),
  getFAQs: () => api.get<ListResponse<FAQSummary>>('/api/docs/faq'),
  getFAQDetail: (faqId: string) => api.get<FAQDetail>(`/api/docs/faq/${faqId}`),
  getAllFAQs: () => api.get<ListResponse<FAQDetail>>('/api/docs/faq/all'),
  getChangelog: () => api.get<ListResponse<ChangelogEntry>>('/api/docs/changelog'),
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

  // C1 — Mixed-granularity forecast grid [C-FG-02]
  // v5 B2 [B-OQ-02]: optional `version` query param threaded by the simulator
  // sandbox (e.g. `version='scenario-{id}'`). Backend route at
  // backend/routers/workbench.py:1482 currently ignores the param (FastAPI
  // default); proper sandbox forecast-grid composition is a backend follow-up
  // tracked in PROGRESS.md as a B-cluster gap.
  getForecastGrid: (
    projectId: string,
    params?: {
      granularity?: 'mixed' | 'monthly' | 'quarterly';
      boundary_months?: number;
      horizon_months?: number;
      version?: string;
      // v5.1 W3 [C-04]: extends inner monthly window backwards so past
      // months (with full actuals) render alongside future ones. Default
      // server-side is 12. Pass 0 to revert to demo_date as the lower bound.
      lookback_months?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params?.granularity) qs.append('granularity', params.granularity);
    if (params?.boundary_months !== undefined) qs.append('boundary_months', String(params.boundary_months));
    if (params?.horizon_months !== undefined) qs.append('horizon_months', String(params.horizon_months));
    if (params?.version) qs.append('version', params.version);
    if (params?.lookback_months !== undefined) qs.append('lookback_months', String(params.lookback_months));
    const suffix = qs.toString();
    return api.get<MixedGridResponse>(
      `/api/projects/${projectId}/forecast/grid${suffix ? `?${suffix}` : ''}`,
    );
  },

  // C1 — Forecast version history [C-RH-01]
  listForecastVersions: (projectId: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.append('limit', String(params.limit));
    if (params?.offset !== undefined) qs.append('offset', String(params.offset));
    const suffix = qs.toString();
    return api.get<ForecastVersionListResponse>(
      `/api/projects/${projectId}/forecast/versions${suffix ? `?${suffix}` : ''}`,
    );
  },

  // C1 — Single version detail [C-RH-02]
  getForecastVersion: (projectId: string, versionId: number) =>
    api.get<ForecastVersionDetail>(
      `/api/projects/${projectId}/forecast/versions/${versionId}`,
    ),

  // C1 — Manual snapshot (controller only) [C-FV-03]
  createForecastVersion: (projectId: string, label?: string) =>
    api.post<ForecastVersionMeta>(
      `/api/projects/${projectId}/forecast/versions`,
      { label: label ?? null },
    ),

  // C1 — Diff two versions [C-RH-05]
  getForecastVersionDiff: (versionAId: number, versionBId: number) =>
    api.get<ForecastVersionDiff>(
      `/api/forecast/versions/${versionAId}/diff/${versionBId}`,
    ),

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

  // v5 E7 [E-06a] — anonymised role × location availability for PL launchpad
  getRoleAvailability: (params?: {
    location_id?: string;
    role_type_id?: string;
    month_from?: string;
    month_to?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.location_id) q.set('location_id', params.location_id);
    if (params?.role_type_id) q.set('role_type_id', params.role_type_id);
    if (params?.month_from) q.set('month_from', params.month_from);
    if (params?.month_to) q.set('month_to', params.month_to);
    const qs = q.toString();
    return api.get<RoleAvailabilityResponse>(
      `/api/capacity/role-availability${qs ? '?' + qs : ''}`,
    );
  },

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

// ---------------------------------------------------------------------------
// === Tech Navigator (A7) ===
// Backend: backend/routers/tech_navigator.py [A-TN-01..A-TN-09].
// ---------------------------------------------------------------------------

import type {
  TechNavigatorProfile,
  TechNavigatorUpdate,
} from '@/types/techNavigator';

export const techNavigatorApi = {
  /** Read the full Tech Navigator profile + active admin weights snapshot. */
  get: (projectId: string) =>
    api.get<TechNavigatorProfile>(`/api/projects/${projectId}/tech-navigator`),

  /** Partial update. Returns the full recomputed profile. */
  update: (projectId: string, body: TechNavigatorUpdate) =>
    api.put<TechNavigatorProfile>(
      `/api/projects/${projectId}/tech-navigator`,
      body,
    ),
};

// ---------------------------------------------------------------------------
// === Backlog (A6) [A-BK-01..26]
// ---------------------------------------------------------------------------

import type {
  RankedBacklogResponse,
  CutoffLinesResponse,
  IntakeQueueItem,
} from '@/types/api';
import type { MilestoneListResponse } from '@/types/milestones';

export const backlogApi = {
  /**
   * GET /api/portfolio/backlog — ranked items + pre-funded + cutoff + config.
   * Optional server-side filters narrow items[]; cutoff is always portfolio-wide.
   */
  getBacklog: (params?: {
    pipeline_stage?: string;
    project_type?: string;
    tshirt_size?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.pipeline_stage) q.set('pipeline_stage', params.pipeline_stage);
    if (params?.project_type) q.set('project_type', params.project_type);
    if (params?.tshirt_size) q.set('tshirt_size', params.tshirt_size);
    const qs = q.toString();
    return api.get<RankedBacklogResponse>(`/api/portfolio/backlog${qs ? '?' + qs : ''}`);
  },

  /** GET /api/portfolio/backlog/cutoff — KPI strip only (no item list). */
  getCutoff: () => api.get<CutoffLinesResponse>('/api/portfolio/backlog/cutoff'),
};

export const intakeApi = {
  /**
   * GET /api/intake/queue — Under Evaluation projects (controller/exec see all,
   * PL sees own). Used by backlog to show projects in the Under Evaluation stage.
   */
  getQueue: () => api.get<{ items: IntakeQueueItem[]; total: number }>('/api/intake/queue'),
};

export const milestonesApi = {
  /** GET /api/projects/{id}/milestones — read-only milestone list. */
  list: (projectId: string) =>
    api.get<MilestoneListResponse>(`/api/projects/${projectId}/milestones`),
};

// ---------------------------------------------------------------------------
// === Progress Tracker (E1) [E-04c] [E-05a]
// ---------------------------------------------------------------------------

import type {
  ProgressResponse,
  ProgressUpdateRequest,
  ProgressHistoryListResponse,
  ProgressSnapshotDetail,
  DeliverableListResponse,
} from '@/types/progress';

export const progressApi = {
  /** GET /api/projects/{id}/progress — current live progress state. */
  get: (projectId: string) =>
    api.get<ProgressResponse>(`/api/projects/${projectId}/progress`),

  /** PATCH /api/projects/{id}/progress — partial update (live edit). */
  update: (projectId: string, body: ProgressUpdateRequest) =>
    api.put<ProgressResponse>(`/api/projects/${projectId}/progress`, body),

  /**
   * GET /api/projects/{id}/progress/history — list of progress snapshots,
   * newest first. One snapshot per forecast cycle submission.
   */
  getHistory: (projectId: string) =>
    api.get<ProgressHistoryListResponse>(
      `/api/projects/${projectId}/progress/history`,
    ),

  /** GET /api/projects/{id}/progress/history/{snapshot_id} — full snapshot. */
  getSnapshot: (projectId: string, snapshotId: number) =>
    api.get<ProgressSnapshotDetail>(
      `/api/projects/${projectId}/progress/history/${snapshotId}`,
    ),

  /**
   * GET /api/projects/{id}/milestones/{milestone_id}/checklist — deliverable
   * checklist items for a single milestone. Useful when an external surface
   * (e.g. the progress tracker dialog) wants the live checklist state.
   */
  getMilestoneChecklist: (projectId: string, milestoneId: number) =>
    api.get<DeliverableListResponse>(
      `/api/projects/${projectId}/milestones/${milestoneId}/checklist`,
    ),
};

// ---------------------------------------------------------------------------
// === Pipeline / DoI (A8) [A-PS-01..13] [A-DOI-01..11]
// ---------------------------------------------------------------------------

import type {
  PipelineState,
  StageTransitionRequest,
  IntakeProjectCreate,
  IntakeProjectResponse,
} from '@/types/pipeline';

export const pipelineApi = {
  /** GET /api/projects/{id}/pipeline — current stage / DoI / gate state. */
  get: (projectId: string) =>
    api.get<PipelineState>(`/api/projects/${projectId}/pipeline`),

  /** POST /api/projects/{id}/pipeline/transition — move stage / DoI. */
  transition: (projectId: string, body: StageTransitionRequest) =>
    api.post<PipelineState>(
      `/api/projects/${projectId}/pipeline/transition`,
      body,
    ),
};

export const intakeProjectApi = {
  /** POST /api/intake/projects — DoI 0 lightweight create [A-DOI-04]. */
  create: (body: IntakeProjectCreate) =>
    api.post<IntakeProjectResponse>('/api/intake/projects', body),
};

// ---------------------------------------------------------------------------
// === Run Portfolio (A8) [E-11]
// ---------------------------------------------------------------------------

import type {
  ChargeableEntityItem,
  ChargeableEntityListResponse,
} from '@/types/runPortfolio';

export const chargeableEntitiesApi = {
  /**
   * GET /api/admin/chargeable-entities — list ChargeableEntities filtered by
   * entity_type. Used by the Run Portfolio sub-module per [E-11].
   *
   * Endpoint mounts under /api/admin/* in the F2 router; backend restricts
   * the call to controllers. Non-controllers receive a 403 which the UI
   * surfaces as an empty-state message pointing at upcoming F-cluster
   * sessions.
   */
  list: (params?: {
    entity_type?: 'Project' | 'Offering' | 'InternalService';
    is_active?: boolean | null;
  }) => {
    const q = new URLSearchParams();
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.is_active === null) q.set('is_active', 'null');
    else if (params?.is_active !== undefined) {
      q.set('is_active', String(params.is_active));
    }
    const qs = q.toString();
    return api.get<ChargeableEntityListResponse>(
      `/api/admin/chargeable-entities${qs ? '?' + qs : ''}`,
    );
  },
};

// Re-export run-portfolio types for downstream consumers.
export type { ChargeableEntityItem, ChargeableEntityListResponse };

// ---------------------------------------------------------------------------
// === v5 Cluster E Session E5 — External cost views [E-08a..d] ===
// Backed by E2's existing aggregation endpoints under
//   /api/projects/{id}/external-costs/* and /api/portfolio/external-costs/*.
// Owned by T1 in Wave 5; T2 / T3 do not extend this wrapper.
// ---------------------------------------------------------------------------

import type {
  ProjectVendorSummaryResponse,
  ProjectCategoryRollupResponse,
  PortfolioVendorSummaryResponse,
  PortfolioCategoryAnalysisResponse,
  ProjectVendorMatrixResponse,
} from '@/types/api';

interface ExternalCostQuery {
  year?: number;
  lob?: string;
  status?: string;
  rag?: string;
}

function externalCostQs(params?: ExternalCostQuery): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.year !== undefined) q.set('year', String(params.year));
  if (params.lob) q.set('lob', params.lob);
  if (params.status) q.set('status', params.status);
  if (params.rag) q.set('rag', params.rag);
  const qs = q.toString();
  return qs ? '?' + qs : '';
}

export const externalCostsApi = {
  /**
   * Project-scoped vendor breakdown per [E-08a].
   * Routes to: GET /api/workbench/projects/{id}/external-costs/vendor-summary
   * (the project-scoped variants live under the workbench external_costs
   *  router which mounts at /api/workbench, not /api/projects).
   */
  getProjectVendorSummary: (projectId: string, year?: number) =>
    api.get<ProjectVendorSummaryResponse>(
      `/api/workbench/projects/${encodeURIComponent(projectId)}/external-costs/vendor-summary${externalCostQs({ year })}`,
    ),
  /**
   * Project-scoped category rollup per [E-08b].
   * Routes to: GET /api/workbench/projects/{id}/external-costs/category-rollup
   */
  getProjectCategoryRollup: (projectId: string, year?: number) =>
    api.get<ProjectCategoryRollupResponse>(
      `/api/workbench/projects/${encodeURIComponent(projectId)}/external-costs/category-rollup${externalCostQs({ year })}`,
    ),
  /**
   * Portfolio-scoped vendor summary per [E-08c].
   * Routes to: GET /api/portfolio/external-costs/vendor-summary
   */
  getPortfolioVendorSummary: (params?: ExternalCostQuery) =>
    api.get<PortfolioVendorSummaryResponse>(
      `/api/portfolio/external-costs/vendor-summary${externalCostQs(params)}`,
    ),
  /**
   * Portfolio-scoped category analysis per [E-08c].
   * Routes to: GET /api/portfolio/external-costs/category-analysis
   */
  getPortfolioCategoryAnalysis: (params?: ExternalCostQuery) =>
    api.get<PortfolioCategoryAnalysisResponse>(
      `/api/portfolio/external-costs/category-analysis${externalCostQs(params)}`,
    ),
  /**
   * Portfolio project × vendor cross-tab matrix per [E-08d].
   * Routes to: GET /api/portfolio/external-costs/project-vendor-matrix
   */
  getPortfolioProjectVendorMatrix: (params?: ExternalCostQuery) =>
    api.get<ProjectVendorMatrixResponse>(
      `/api/portfolio/external-costs/project-vendor-matrix${externalCostQs(params)}`,
    ),
};

// ---------------------------------------------------------------------------
// === v5 Cluster F — Charging & Allocations API (F4 / F5)
// === Backed by /api/charging (read) + /api/admin (write/admin)
// ---------------------------------------------------------------------------

import type {
  ChargeableEntityType,
  ChargeableEntityItem as ChargingApiChargeableEntityItem,
  DistributionEdgeItem,
  EntityDistributionSummary,
  DistributionEffectiveCost,
  BTCProfileItem,
  BTCMode,
  BTCStatus,
  BTCRefreshDiffResult,
  BTCYearRolloverRequest,
  BTCYearRolloverResult,
  RollupListResponse as ChargingRollupListResponse,
  RollupGroupBy,
  RollupDrillDownResponse,
  UpstreamChainResponse,
  AllocationBreakdownSortBy,
  EntityAllocationBreakdownResponse,
  LocationBreakdownResponse,
} from '@/types/api';

export const chargingApi = {
  // === ChargeableEntity catalogue [F-DM-01] ===
  listEntities: (params?: {
    entity_type?: ChargeableEntityType;
    hierarchy_node_id?: string;
    is_active?: boolean | null;
  }) => {
    const q = new URLSearchParams();
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.hierarchy_node_id) q.set('hierarchy_node_id', params.hierarchy_node_id);
    if (params?.is_active === false) q.set('is_active', 'false');
    if (params?.is_active === null) q.set('is_active', 'null');
    const qs = q.toString();
    return api.get<ListResponse<ChargingApiChargeableEntityItem>>(
      `/api/admin/chargeable-entities${qs ? '?' + qs : ''}`,
    );
  },
  getEntity: (id: string) =>
    // Charging-namespaced read endpoint accessible to all four roles
    // per F6 [E-09]. The admin variant remains controller-only for
    // mutation paths.
    api.get<ChargingApiChargeableEntityItem>(
      `/api/charging/entities/${id}`,
    ),
  getEntityByProjectId: (projectId: string) =>
    api.get<ChargingApiChargeableEntityItem>(
      `/api/charging/entities/by-project/${projectId}`,
    ),
  /**
   * Read-only charging locations list — accessible to all four roles per F6.
   * For mutation, callers go through `adminD3Api.getChargingLocations()`
   * which remains controller-only.
   */
  listChargingLocationsReadOnly: () =>
    api.get<{
      items: import('@/types/api').ChargingLocationItem[];
      total: number;
    }>(`/api/charging/charging-locations`),

  // === Stage 1 inter-service Distribution edges [F-S1-01..05] ===
  listDistributions: (params?: {
    year?: number;
    version?: string;
    source_entity_id?: string;
    destination_entity_id?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.year !== undefined) q.set('year', String(params.year));
    if (params?.version) q.set('version', params.version);
    if (params?.source_entity_id) q.set('source_entity_id', params.source_entity_id);
    if (params?.destination_entity_id) q.set('destination_entity_id', params.destination_entity_id);
    const qs = q.toString();
    return api.get<ListResponse<DistributionEdgeItem>>(
      `/api/charging/distributions${qs ? '?' + qs : ''}`,
    );
  },
  getEntityDistributionSummary: (entityId: string, year: number, version: string = 'forecast') =>
    api.get<EntityDistributionSummary>(
      `/api/charging/entities/${entityId}/distribution-summary?year=${year}&version=${encodeURIComponent(version)}`,
    ),
  createDistribution: (data: {
    year: number;
    version: string;
    source_entity_id: string;
    destination_entity_id: string;
    percentage: number;
  }) => api.post<DistributionEdgeItem>('/api/charging/distributions', data),
  updateDistribution: (id: number, data: { percentage: number }) =>
    api.put<DistributionEdgeItem>(`/api/charging/distributions/${id}`, data),
  deleteDistribution: (id: number) =>
    api.delete<{ id: number; deleted: boolean }>(`/api/charging/distributions/${id}`),
  updateEntityToBusinessPct: (entityId: string, year: number, newPct: number, version: string = 'forecast') =>
    api.put<EntityDistributionSummary>(
      `/api/charging/entities/${entityId}/to-business-pct?new_pct=${newPct}&year=${year}&version=${encodeURIComponent(version)}`,
    ),
  getEntityEffectiveCost: (entityId: string, year: number, version: string = 'forecast') =>
    api.get<DistributionEffectiveCost>(
      `/api/charging/entities/${entityId}/effective-cost?year=${year}&version=${encodeURIComponent(version)}`,
    ),
  getEntityUpstreamChain: (entityId: string, year: number, version: string = 'forecast') =>
    api.get<UpstreamChainResponse>(
      `/api/charging/entities/${entityId}/upstream-chain?year=${year}&version=${encodeURIComponent(version)}`,
    ),

  // === Stage 2 BTC Profiles [F-S2-01..08] ===
  listBTCProfiles: (params?: {
    entity_id?: string;
    year?: number;
    status?: BTCStatus;
    mode?: BTCMode;
  }) => {
    const q = new URLSearchParams();
    if (params?.entity_id) q.set('entity_id', params.entity_id);
    if (params?.year !== undefined) q.set('year', String(params.year));
    if (params?.status) q.set('status', params.status);
    if (params?.mode) q.set('mode', params.mode);
    const qs = q.toString();
    return api.get<ListResponse<BTCProfileItem>>(
      `/api/charging/btc-profiles${qs ? '?' + qs : ''}`,
    );
  },
  getBTCProfile: (id: number) =>
    api.get<BTCProfileItem>(`/api/charging/btc-profiles/${id}`),
  getEntityBTCProfile: (entityId: string, year: number) =>
    api.get<BTCProfileItem>(
      `/api/charging/entities/${entityId}/btc-profile?year=${year}`,
    ),
  createBTCProfile: (data: {
    entity_id: string;
    year: number;
    mode: BTCMode;
    s_code?: string | null;
    status?: BTCStatus;
    lines?: { charging_location_id: string; percentage: number }[];
    um_year?: number | null;
    um_quarter?: number | null;
  }) => api.post<BTCProfileItem>('/api/charging/btc-profiles', data),
  updateBTCProfile: (id: number, data: {
    lines: { charging_location_id: string; percentage: number }[];
  }) => api.put<BTCProfileItem>(`/api/charging/btc-profiles/${id}`, data),
  deleteBTCProfile: (id: number) =>
    api.delete<{ id: number; deleted: boolean }>(`/api/charging/btc-profiles/${id}`),
  refreshBTCFromUM: (id: number, data: {
    um_year?: number | null;
    um_quarter?: number | null;
    dry_run?: boolean;
  }) =>
    api.post<BTCRefreshDiffResult>(`/api/charging/btc-profiles/${id}/refresh-um`, data),
  changeBTCMode: (id: number, data: {
    new_mode: BTCMode;
    s_code?: string | null;
    confirm: boolean;
    um_year?: number | null;
    um_quarter?: number | null;
  }) =>
    api.post<BTCProfileItem>(`/api/charging/btc-profiles/${id}/change-mode`, data),
  copyBTCProfileFrom: (data: {
    source_profile_id: number;
    target_entity_id: string;
    target_year: number;
    target_status?: BTCStatus;
  }) =>
    api.post<BTCProfileItem>(`/api/charging/btc-profiles/${data.source_profile_id}/copy-from`, data),
  // POST /api/admin/btc-profiles/year-rollover [F-S2-07]
  // Item 6: optional entity_types/entity_ids scope filters narrow the set of
  // source-year profiles considered. Both null/undefined → roll all.
  yearRolloverBTCProfiles: (data: BTCYearRolloverRequest) =>
    api.post<BTCYearRolloverResult>(
      '/api/admin/btc-profiles/year-rollover', data,
    ),

  // === Rollup query + drill-down [F-RV-01..06] ===
  getRollup: (params: {
    year: number;
    version?: string;
    group_by?: RollupGroupBy;
    entity_type?: ChargeableEntityType;
  }) => {
    const q = new URLSearchParams();
    q.set('year', String(params.year));
    if (params.version) q.set('version', params.version);
    if (params.group_by) q.set('group_by', params.group_by);
    if (params.entity_type) q.set('entity_type', params.entity_type);
    return api.get<ChargingRollupListResponse>(`/api/charging/rollup?${q.toString()}`);
  },
  getRollupDrillDown: (params: {
    cl_id: string;
    entity_id: string;
    year: number;
    version?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('entity_id', params.entity_id);
    q.set('year', String(params.year));
    if (params.version) q.set('version', params.version);
    return api.get<RollupDrillDownResponse>(
      `/api/charging/rollup/charging-location/${params.cl_id}?${q.toString()}`,
    );
  },

  // === Per-entity BTC allocation breakdown (Workbench BTC tab F6) [E-09] ===
  getEntityAllocationBreakdown: (params: {
    entity_id: string;
    year: number;
    version?: string;
    sort_by?: AllocationBreakdownSortBy;
    sort_dir?: 'asc' | 'desc';
  }) => {
    const q = new URLSearchParams();
    q.set('year', String(params.year));
    if (params.version) q.set('version', params.version);
    if (params.sort_by) q.set('sort_by', params.sort_by);
    if (params.sort_dir) q.set('sort_dir', params.sort_dir);
    return api.get<EntityAllocationBreakdownResponse>(
      `/api/charging/entities/${params.entity_id}/allocation-breakdown?${q.toString()}`,
    );
  },

  // === Per-charging-location breakdown (rollup map level-4 drill) ===
  getLocationBreakdown: (params: {
    cl_id: string;
    year: number;
    version?: string;
  }) => {
    const q = new URLSearchParams();
    q.set('year', String(params.year));
    if (params.version) q.set('version', params.version);
    return api.get<LocationBreakdownResponse>(
      `/api/charging/locations/${params.cl_id}/breakdown?${q.toString()}`,
    );
  },
};
