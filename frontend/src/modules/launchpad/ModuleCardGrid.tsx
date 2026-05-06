/**
 * v5.1 W6 [C-01] — Launchpad Zone 3 module-card grid.
 *
 * Replaces the role-personalised KPI tile grid with a fixed 3-column
 * module-launch grid. Each card shows:
 *   - Lucide icon (top-left)
 *   - Module name (primary, bold)
 *   - One-line description (muted)
 *   - 1–2 role-differentiated subtitle KPI rows
 *
 * The backend (`GET /api/modules`) already gates visibility per role and
 * stamps each tile with `subtitle_kpis`; this component just sorts and
 * renders. Cards inaccessible to the current role are filtered out
 * (defensive double-check) rather than greyed.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { modulesApi } from '@/api/endpoints';
import { MODULE_ROUTES } from '@/lib/routes';
import { ActionCard } from '@/components/shared/ActionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/shared/Skeleton';
import type { ModuleTile } from '@/types/api';
import { MODULE_CARD_ICONS } from './moduleCardIcons';

export function ModuleCardGrid() {
  const { currentRoleId } = useRole();
  const navigate = useNavigate();
  const [modules, setModules] = useState<ModuleTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    modulesApi
      .getAll()
      .then((res) => setModules(res.items))
      .catch(() => {
        setErrored(true);
        setModules([]);
      })
      .finally(() => setLoading(false));
  }, [currentRoleId]);

  // Server gates visibility; client-side filter is a defensive double-check.
  const visibleModules = modules
    .filter((m) => m.visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="max-w-screen-2xl mx-auto rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load modules. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (visibleModules.length === 0) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <EmptyState
          icon={Inbox}
          title="No modules available"
          description="No modules available for this role."
        />
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="grid grid-cols-3 gap-4">
        {visibleModules.map((mod) => {
          const Icon = MODULE_CARD_ICONS[mod.id];
          const route = MODULE_ROUTES[mod.id];
          // The spec calls for the icon top-left and module name as primary
          // bold text. ActionCard's default title renders muted in the
          // header — we override by passing a styled span so the module
          // name reads as the card's primary heading.
          return (
            <ActionCard
              key={mod.id}
              title={
                <span className="text-foreground font-semibold text-base">
                  {mod.name}
                </span>
              }
              ariaLabel={mod.name}
              onClick={route ? () => navigate(route) : undefined}
            >
              <div className="mt-3 flex flex-col gap-3">
                {Icon && (
                  <Icon
                    className="h-6 w-6 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {mod.description}
                  </p>
                  {mod.subtitle_kpis.map((kpi, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-foreground"
                    >
                      {kpi}
                    </p>
                  ))}
                </div>
              </div>
            </ActionCard>
          );
        })}
      </div>
    </div>
  );
}
