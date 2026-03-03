import { api } from './client';
import type {
  RoleInfo,
  RoleContext,
  Notification,
  PortfolioKPISummary,
  ModuleTile,
  ListResponse,
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
