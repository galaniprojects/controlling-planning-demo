import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { RoleInfo, RoleContext as RoleContextType } from '@/types/api';
import { rolesApi } from '@/api/endpoints';
import { setCurrentUser } from '@/api/client';

interface RoleState {
  roles: RoleInfo[];
  currentRoleId: string;
  context: RoleContextType | null;
  isLoading: boolean;
  switchRole: (roleId: string) => Promise<void>;
}

const RoleCtx = createContext<RoleState | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState(
    () => localStorage.getItem('creta-persona') || 'persona-controller',
  );
  const [context, setContext] = useState<RoleContextType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const switchRole = useCallback(async (roleId: string) => {
    setIsLoading(true);
    setCurrentUser(roleId);
    setCurrentRoleId(roleId);
    try {
      const ctx = await rolesApi.getContext(roleId);
      setContext(ctx);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    rolesApi.getAll().then((res) => setRoles(res.items));
    switchRole(localStorage.getItem('creta-persona') || 'persona-controller');
  }, [switchRole]);

  return (
    <RoleCtx.Provider value={{ roles, currentRoleId, context, isLoading, switchRole }}>
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
