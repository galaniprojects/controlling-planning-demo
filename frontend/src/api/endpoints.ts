import { api } from './client';
import type {
  RoleInfo,
  RoleContext,
  Notification,
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

// --- Portfolio Overview ---

export const portfolioApi = {
  // Dashboard
  getKPIs: () => api.get<PortfolioKPIs>('/api/portfolio/kpis'),
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
  getCharts: (lob?: string) =>
    api.get<ChartData>(`/api/portfolio/charts${lob ? '?lob=' + lob : ''}`),

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
};
