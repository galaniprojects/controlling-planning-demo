import { useNavigate } from 'react-router-dom';
import { useRole } from '@/contexts/RoleContext';
import { MODULE_ROUTES } from '@/lib/routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function RoleSwitcher() {
  const { roles, currentRoleId, switchRole } = useRole();
  const navigate = useNavigate();

  const currentRole = roles.find((r) => r.id === currentRoleId);

  const handleSwitch = async (roleId: string) => {
    if (roleId === currentRoleId) return;
    await switchRole(roleId);
    const role = roles.find((r) => r.id === roleId);
    if (role) {
      navigate(MODULE_ROUTES[role.default_module] || '/');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
          <span className="font-medium text-slate-700">
            {currentRole?.user_name ?? 'Loading...'}
          </span>
          <svg
            className="h-3.5 w-3.5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {roles.map((role) => (
          <DropdownMenuItem
            key={role.id}
            onClick={() => handleSwitch(role.id)}
            className={role.id === currentRoleId ? 'bg-slate-100' : ''}
          >
            <div className="flex flex-col">
              <span className="font-medium">{role.user_name}</span>
              <span className="text-xs text-slate-500">{role.user_title}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
