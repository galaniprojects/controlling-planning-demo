import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CircleCheck,
  ChevronRight,
  AlertTriangle,
  Inbox,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MODULE_ROUTES } from '@/lib/routes';
import type { PendingAction } from '@/types/api';

interface Props {
  actions: PendingAction[];
  loading: boolean;
}

/**
 * v5 E7 [E-06b][E-06c] — Horizontal scrollable Pending Actions strip.
 *
 * Replaces the legacy vertical sidebar (Wave 4) with a full-width
 * horizontal strip that sits between Zone 1 (header) and Zone 3 (tile
 * grid). Cards are sorted by urgency (urgent first, then info, then
 * stable on backend order) and the entire strip collapses into a tidy
 * single-line "All caught up" banner when empty.
 */
export function PendingActionsPanel({ actions, loading }: Props) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  function handleClick(action: PendingAction) {
    const baseRoute = MODULE_ROUTES[action.deep_link_module] || '/';
    const eid = action.deep_link_entity_id;
    const tab = action.deep_link_tab;

    if (eid) {
      switch (action.deep_link_module) {
        case 'workbench':
          navigate(`${baseRoute}?project=${eid}${tab ? '&tab=' + tab : ''}`);
          return;
        case 'portfolio':
          // v5: intake retired per [A-PS-13] — deep-links land on Backlog instead.
          if (tab === 'intake') {
            navigate(`/backlog/${eid}`);
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

  // Stable sort: urgent first, then everything else in backend-given order.
  const sorted = [...actions].sort((a, b) => {
    if (a.urgency === b.urgency) return 0;
    return a.urgency === 'urgent' ? -1 : 1;
  });

  // Loading skeleton — keeps shape so the page doesn't jump.
  if (loading) {
    return (
      <div className="border border-border bg-card rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Pending Actions</h3>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[72px] w-[260px] shrink-0 rounded-md bg-muted/50 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty state — collapsible "All caught up" banner per [E-06b].
  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-between border border-border bg-card rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-2">
          <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm text-foreground">All caught up — no pending actions</span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          0
        </Badge>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Pending Actions</h3>
          <Badge
            variant={urgentCount > 0 ? 'destructive' : 'secondary'}
            className="text-[10px] px-1.5 py-0"
          >
            {sorted.length}
            {urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-sm"
          aria-label={collapsed ? 'Expand pending actions' : 'Collapse pending actions'}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
          <span>{collapsed ? 'Show' : 'Hide'}</span>
        </button>
      </div>

      {/* Horizontal scrollable strip */}
      {!collapsed && (
        <div className="px-4 py-3 overflow-x-auto">
          <div className="flex gap-3 min-w-min">
            {sorted.map((action) => {
              const isUrgent = action.urgency === 'urgent';
              return (
                <Card
                  key={action.id}
                  onClick={() => handleClick(action)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick(action);
                    }
                  }}
                  className={`group relative shrink-0 w-[280px] cursor-pointer overflow-hidden bg-background transition-all hover:shadow-md hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    isUrgent ? 'border-red-300 dark:border-red-900/60' : ''
                  }`}
                >
                  {/* Urgency accent bar */}
                  <div
                    className={`absolute inset-y-0 left-0 w-[3px] ${
                      isUrgent
                        ? 'bg-red-500/80 dark:bg-red-400/80'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                  <div className="px-3 py-2.5 pl-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isUrgent && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                        )}
                        <p className="text-sm font-medium text-foreground leading-tight truncate">
                          {action.title}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
