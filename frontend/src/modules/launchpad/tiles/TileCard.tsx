import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MODULE_ROUTES } from '@/lib/routes';
import type { TilePayload, TileTone } from '@/types/api';

interface Props {
  tile: TilePayload;
  /** Optional override route — used by the PL Resource Availability tile
   *  which always navigates to the capacity availability tab. */
  overrideHref?: string;
  /** Optional secondary slot rendered below the metric block (e.g. a
   *  Resource Availability summary row). */
  footerSlot?: React.ReactNode;
}

/**
 * Visual tone classes per [E-06d]–[E-06j]. Keeps the light theme palette
 * intact and adds explicit `dark:` variants per CLAUDE.md dark-mode rules.
 */
const TONE_CLASSES: Record<TileTone, { ring: string; primary: string; bar: string }> = {
  neutral: {
    ring: '',
    primary: 'text-foreground',
    bar: 'bg-muted-foreground/20',
  },
  positive: {
    ring: '',
    primary: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500/70 dark:bg-emerald-400/70',
  },
  warning: {
    ring: '',
    primary: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500/80 dark:bg-amber-400/80',
  },
  alert: {
    ring: '',
    primary: 'text-red-700 dark:text-red-400',
    bar: 'bg-red-500/80 dark:bg-red-400/80',
  },
};

/** Build the navigation target for a tile click. */
function buildHref(tile: TilePayload): string {
  const base = MODULE_ROUTES[tile.link_module] || '/';
  const params = new URLSearchParams();
  if (tile.link_entity_id) {
    if (tile.link_module === 'workbench') params.set('project', tile.link_entity_id);
    else if (tile.link_module === 'simulator') params.set('scenario', tile.link_entity_id);
    else if (tile.link_module === 'portfolio') params.set('project', tile.link_entity_id);
    else params.set('id', tile.link_entity_id);
  }
  if (tile.link_tab) params.set('tab', tile.link_tab);
  const qs = params.toString();
  return `${base}${qs ? '?' + qs : ''}`;
}

export function TileCard({ tile, overrideHref, footerSlot }: Props) {
  const navigate = useNavigate();
  const tone = TONE_CLASSES[tile.tone] ?? TONE_CLASSES.neutral;
  const href = overrideHref ?? buildHref(tile);

  return (
    <Card
      onClick={() => navigate(href)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(href);
        }
      }}
      className="group relative cursor-pointer overflow-hidden bg-card transition-all hover:shadow-md hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      {/* Tone accent bar (left edge) */}
      <div className={`absolute inset-y-0 left-0 w-[3px] ${tone.bar}`} />

      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {tile.title}
          </h3>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <p className={`mt-2 text-2xl font-semibold tracking-tight ${tone.primary}`}>
          {tile.primary_metric}
        </p>

        {tile.secondary_metric && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {tile.secondary_metric}
          </p>
        )}

        {footerSlot && (
          <div className="mt-3 border-t border-border pt-2">{footerSlot}</div>
        )}
      </div>
    </Card>
  );
}

export { buildHref };
