import { useNavigate } from 'react-router-dom';
import { CircleCheck, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MODULE_ROUTES } from '@/lib/routes';
import type { PendingAction } from '@/types/api';

interface Props {
  actions: PendingAction[];
  loading: boolean;
}

export function PendingActionsPanel({ actions, loading }: Props) {
  const navigate = useNavigate();

  function handleClick(action: PendingAction) {
    const baseRoute = MODULE_ROUTES[action.deep_link_module] || '/';
    const eid = action.deep_link_entity_id;
    const tab = action.deep_link_tab;

    // Build navigation path based on module and context
    if (eid) {
      switch (action.deep_link_module) {
        case 'workbench':
          navigate(`${baseRoute}?project=${eid}${tab ? '&tab=' + tab : ''}`);
          return;
        case 'portfolio':
          if (tab === 'intake') {
            navigate(`/portfolio/intake?project=${eid}`);
          } else if (tab === 'approvals') {
            navigate(`/portfolio/approvals?cr=${eid}`);
          } else {
            navigate(`${baseRoute}?project=${eid}`);
          }
          return;
        case 'capacity':
          if (tab === 'requests') {
            navigate(`/capacity/requests?cr=${eid}`);
          } else {
            navigate(`${baseRoute}?entity=${eid}`);
          }
          return;
        case 'simulator':
          navigate(`${baseRoute}?scenario=${eid}`);
          return;
      }
    }
    navigate(baseRoute);
  }

  const urgentCount = actions.filter((a) => a.urgency === 'urgent').length;

  return (
    <div className="border border-slate-200 rounded-lg bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Pending Actions</h3>
        {urgentCount > 0 && (
          <Badge variant="destructive" className="text-xs px-1.5 py-0">
            {urgentCount}
          </Badge>
        )}
      </div>

      {/* Actions list */}
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="py-12 text-center">
            <CircleCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">All caught up</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {actions.map((action) => (
              <div
                key={action.id}
                onClick={() => handleClick(action)}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                {/* Urgency bar */}
                <div
                  className={`w-[3px] self-stretch rounded-full shrink-0 ${
                    action.urgency === 'urgent' ? 'bg-red-500' : 'bg-slate-300'
                  }`}
                />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-tight">
                    {action.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {action.description}
                  </p>
                </div>
                {/* Arrow */}
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
