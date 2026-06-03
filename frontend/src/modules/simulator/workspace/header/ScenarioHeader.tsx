/**
 * v5 B2 — Workspace header.
 *
 * Composition:
 *  - Left: back button, scenario name + description, status badge
 *  - Right: stale indicator, Recalculate, lifecycle dropdown (publish /
 *    unpublish / archive / delete), Apply-to-forecast (PL only),
 *    Promote (controller only — mounted by T4 via the drawer slot),
 *    Advisor button (gated on ADVISOR_ENABLED — kept verbatim from v4).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, Sparkles, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModuleGuideButton } from '@/components/shared/ModuleGuideButton';
import { useScenarioContext } from '../../useScenarioContext';
import { ADVISOR_ENABLED } from '../../flags/advisorFlag';
import { useCanApplyToForecast } from '../../permissions/useCanApplyToForecast';
import { ApplyButton } from '../../apply-to-forecast/ApplyButton';
import { ScenarioStatusBadge } from './ScenarioStatusBadge';
import { StaleIndicator } from './StaleIndicator';
import { RecalculateButton } from './RecalculateButton';

interface Props {
  onOpenAdvisor?: () => void;
  onOpenPromote?: () => void;
}

export function ScenarioHeader({ onOpenAdvisor, onOpenPromote }: Props) {
  const navigate = useNavigate();
  const ctx = useScenarioContext();
  const canApply = useCanApplyToForecast();

  const detail = ctx.detail;
  const meta = detail?.metadata as
    | (typeof detail extends null
        ? never
        : { name: string; description: string | null; status: string })
    | undefined;

  // Simulator S4 — handoff slice. A PL viewing a published scenario they
  // did NOT author is seeing the leadership→PL handoff (§9.1); their
  // path-to-live is Apply-to-forecast (NOT promote).
  const isHandoff = canApply && !ctx.isOwner && meta?.status === 'published';

  const lastRecalcRaw = (detail?.metadata as unknown as {
    last_recalculated_at?: string | null;
  })?.last_recalculated_at;

  const handleRecalc = async () => {
    await ctx.recalculate();
  };

  const handlePublish = async () => {
    await ctx.publish();
  };

  const handleUnpublish = async () => {
    await ctx.unpublish();
  };

  const handleArchive = async () => {
    await ctx.archive(!ctx.archived);
  };

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete this scenario?')) return;
    // Use the legacy wrapper (it already handles 200 → status:deleted).
    await import('../../api/scenariosApi').then(({ scenariosApi }) =>
      scenariosApi.remove(ctx.scenarioId),
    );
    navigate('/simulator');
  };

  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-3 min-w-0">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back to manager"
          onClick={() => navigate('/simulator')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {meta?.name ?? `Scenario #${ctx.scenarioId}`}
            </h1>
            {detail && (
              <ScenarioStatusBadge
                status={meta?.status ?? 'private'}
                visibility={ctx.visibility}
                archived={ctx.archived}
              />
            )}
            {isHandoff && (
              <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400">
                <ArrowDownToLine className="h-3 w-3 mr-1" aria-hidden="true" />
                Handoff from {detail?.metadata.author_name}
              </Badge>
            )}
          </div>
          {meta?.description && (
            <p className="text-xs text-muted-foreground truncate">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <StaleIndicator
          stale={ctx.stale}
          lastRecalculatedAt={lastRecalcRaw ?? null}
        />
        <RecalculateButton
          loading={ctx.loading}
          stale={ctx.stale}
          onClick={handleRecalc}
        />
        {ADVISOR_ENABLED && onOpenAdvisor && (
          <Button variant="outline" size="sm" onClick={onOpenAdvisor}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            AI Advisor
          </Button>
        )}
        {canApply && <ApplyButton />}
        <ModuleGuideButton moduleId="whatif_simulator" />
        {ctx.isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Simulator S4 — Publish gated on canPublish (controllers +
                  PLs; executives excluded). For a PL, publishing means
                  oversight + handoff, NOT promote (§9.2). */}
              {ctx.canPublish &&
                (meta?.status === 'private' ? (
                  <DropdownMenuItem onClick={handlePublish}>
                    Publish
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleUnpublish}>
                    Unpublish
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem onClick={handleArchive}>
                {ctx.archived ? 'Restore from archive' : 'Archive'}
              </DropdownMenuItem>
              {ctx.canPromote && onOpenPromote && (
                <DropdownMenuItem onClick={onOpenPromote}>
                  Promote scenario…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 dark:text-red-400"
                onClick={handleDelete}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
