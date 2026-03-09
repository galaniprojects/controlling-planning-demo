import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { MODULE_ROUTES } from '@/lib/routes';
import { severityColor } from '@/lib/rag';
import type { Notification } from '@/types/api';

interface Props {
  notifications: Notification[];
}

export function NotificationsList({ notifications }: Props) {
  const navigate = useNavigate();

  if (notifications.length === 0) return null;

  const handleClick = (n: Notification) => {
    if (!n.deep_link_module) return;
    const route = MODULE_ROUTES[n.deep_link_module] || '/';
    const eid = n.deep_link_entity_id;

    if (eid) {
      switch (n.deep_link_module) {
        case 'workbench':
          navigate(`${route}?project=${eid}`);
          return;
        case 'portfolio':
          navigate(`/portfolio/intake?project=${eid}`);
          return;
        case 'capacity':
          navigate(`${route}?person=${eid}`);
          return;
      }
    }
    navigate(route);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-700">Alerts & Notifications</h2>
      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            className={`flex items-center gap-3 rounded-lg border p-3 ${severityColor(n.severity)} ${
              n.deep_link_module ? 'cursor-pointer hover:opacity-80' : ''
            }`}
          >
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {n.severity}
            </Badge>
            <span className="text-sm">{n.message}</span>
            {!n.is_read && (
              <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
