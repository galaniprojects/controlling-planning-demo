/**
 * Service header tile (position 1,1) — service identity card.
 *
 * Identity-only, non-clickable. Mirrors the existing ProjectHeaderTile's
 * role in the project tile grid: title surface that anchors the page.
 */
import { ActionCard } from '@/components/shared/ActionCard';
import { Badge } from '@/components/ui/badge';
import { EntityTypeBadge } from '@/components/shared/EntityTypeBadge';
import type { ChargeableEntityItem } from '@/types/api';

interface Props {
  entity: ChargeableEntityItem;
  ownerName: string | null;
  hierarchyName: string | null;
}

export function ServiceHeaderTile({ entity, ownerName, hierarchyName }: Props) {
  return (
    <ActionCard title={entity.name}>
      <div className="space-y-2 mt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <EntityTypeBadge type={entity.entity_type} />
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 font-medium"
          >
            Run
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">
            {entity.identifier}
          </span>
        </div>
        {entity.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {entity.description}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1">
          <div className="space-y-0.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Owner
            </dt>
            <dd className="text-foreground truncate" title={ownerName ?? undefined}>
              {ownerName ?? '—'}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Hierarchy
            </dt>
            <dd
              className="text-foreground truncate"
              title={hierarchyName ?? undefined}
            >
              {hierarchyName ?? '—'}
            </dd>
          </div>
        </dl>
      </div>
    </ActionCard>
  );
}
