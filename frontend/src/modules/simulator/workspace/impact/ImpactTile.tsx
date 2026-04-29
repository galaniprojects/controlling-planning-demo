/**
 * Single tile in the impact summary strip.
 *
 * Spec line 1074: "Eight compact tiles, one per impact dimension. Each tile
 * shows the headline delta as a compact card (e.g., 'Budget: -€1.2M ↓8%' /
 * 'Ranking: 3 projects shifted' / 'Capacity: 2 CCs over 100%')." Tiles for
 * Tier 3 dimensions (People impact) are hidden for users without Tier 3
 * permission.
 *
 * Per CLAUDE.md: directional indicators inline with arrows + +/- prefixes
 * (NOT colour). Tile click expands the detail panel below the strip.
 *
 * Stale = true means the headline is potentially out of date until the user
 * clicks Recalculate. We surface a small dot + tooltip rather than colouring
 * the whole tile, so the colour stays available for layout / theme.
 */

import {
  Wallet,
  ListOrdered,
  Users,
  UserCog,
  Split,
  PieChart,
  TrendingUp,
  Route,
  ClipboardList,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DimensionKey, DimensionMeta } from '../../lib/impactTypes';

const ICON_MAP: Record<DimensionMeta['iconKey'], React.ComponentType<{ className?: string }>> = {
  wallet: Wallet,
  'list-ordered': ListOrdered,
  users: Users,
  'user-cog': UserCog,
  split: Split,
  'pie-chart': PieChart,
  'trending-up': TrendingUp,
  route: Route,
  'clipboard-list': ClipboardList,
};

interface ImpactTileProps {
  meta: DimensionMeta;
  /** Short headline string from the dimension data (e.g., "-€1.2M ↓8%"). */
  headline: string;
  /** Stale indicator — when true the tile shows a small "stale" dot. */
  stale?: boolean;
  /** Active = this tile's detail panel is currently open. */
  active: boolean;
  /** Disabled (e.g., dimension unavailable / redacted). */
  disabled?: boolean;
  /** Click handler — opens / closes the detail panel for this dimension. */
  onClick: (key: DimensionKey) => void;
}

export function ImpactTile({
  meta,
  headline,
  stale = false,
  active,
  disabled = false,
  onClick,
}: ImpactTileProps) {
  const Icon = ICON_MAP[meta.iconKey];
  const isInteractive = !disabled;

  return (
    <Card
      role="button"
      tabIndex={isInteractive ? 0 : -1}
      aria-pressed={active}
      aria-label={`${meta.label}: ${headline}`}
      data-testid={`impact-tile-${meta.key}`}
      onClick={() => isInteractive && onClick(meta.key)}
      onKeyDown={(e) => {
        if (!isInteractive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(meta.key);
        }
      }}
      className={[
        'relative px-3 py-2.5 min-w-[160px] flex flex-col gap-1.5 transition-all',
        'border bg-card',
        isInteractive
          ? 'cursor-pointer hover:border-primary/60 hover:shadow-sm'
          : 'opacity-50 cursor-not-allowed',
        active
          ? 'border-primary ring-1 ring-primary/30 bg-accent/40'
          : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">
            {meta.label}
          </span>
        </div>
        {stale && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid={`impact-tile-${meta.key}-stale`}
                  className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 ring-2 ring-amber-200/50 dark:ring-amber-700/40"
                  aria-label="Stale — recalculate to refresh"
                />
              </TooltipTrigger>
              <TooltipContent>
                Stale — click Recalculate to refresh
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="text-sm font-semibold text-foreground leading-tight">
        {headline}
      </div>
    </Card>
  );
}
