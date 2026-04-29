/**
 * v5 B2 — Surface: People Master Data (Tier 3 only).
 *
 * Sandbox surface for hire / depart / reassign people changes per
 * spec line 864. Tier 3 — when `useTier3()` is false, the surface
 * returns `null` (hidden DOM per `[B-AC-02]`). Backend redacts /
 * rejects independently.
 *
 * Co-located with the four restructuring catalogue actions
 * (`catalogue/restructuring/`) to keep all Tier-3 people surfaces
 * grouped under one ownership boundary.
 *
 * v4 ramped this surface only as far as `change_allocation` actions
 * — true hire / depart workflows are out of scope for the demo.
 * For B2 we expose the four restructuring catalogue actions as
 * shortcuts plus a placeholder grid that explains the cascade.
 */

import { Sparkles, UserMinus, UserPlus, Users, MoveRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTier3 } from '../permissions';
import { useScenarioContext } from '../useScenarioContext';
import { ActionForm } from '../catalogue/ActionForm';
import { findActionById } from '../catalogue/catalogueDef';

interface Props {
  /** Optional initial action picker (one of the 4 restructuring actions). */
  initialActionId?:
    | 'hire-block'
    | 'remove-role'
    | 'reduce-headcount'
    | 'relocate-team';
}

const ACTION_TILES: Array<{
  id:
    | 'hire-block'
    | 'remove-role'
    | 'reduce-headcount'
    | 'relocate-team';
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: 'hire-block',
    label: 'Add hypothetical hires',
    description: 'Create a block of new headcount available from a future month.',
    icon: UserPlus,
  },
  {
    id: 'remove-role',
    label: 'Remove role from portfolio',
    description: 'Zero out all allocations for a role across all projects.',
    icon: UserMinus,
  },
  {
    id: 'reduce-headcount',
    label: 'Reduce headcount by location',
    description: 'Reduce available FTEs at a location.',
    icon: Users,
  },
  {
    id: 'relocate-team',
    label: 'Relocate team',
    description: 'Move headcount between cost centres / locations.',
    icon: MoveRight,
  },
];

export function PeopleMasterSurface({ initialActionId }: Props) {
  const { tier3Visible } = useScenarioContext();
  const hasTier3 = useTier3({ impactTier3Visible: tier3Visible });

  // Hidden DOM — return nothing for non-Tier-3 users. Defence in depth.
  if (!hasTier3) return null;

  // If a specific action was requested, render its form.
  if (initialActionId) {
    const action = findActionById(initialActionId);
    if (action) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              People master data
              <Badge
                variant="outline"
                className="border-amber-300 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400"
              >
                Tier 3
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={action} />
          </CardContent>
        </Card>
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          People master data
          <Badge
            variant="outline"
            className="border-amber-300 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400"
          >
            Tier 3
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add, remove, or relocate people in the sandbox. Removals zero out all
          allocations for the affected people across every project.
          Promote routes these as HR action items rather than direct database
          mutations — see{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            services/scenario_promote.py
          </code>
          .
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ACTION_TILES.map((tile) => {
            const action = findActionById(tile.id);
            if (!action) return null;
            return (
              <details
                key={tile.id}
                className="rounded-md border border-border bg-card p-3 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-start gap-2 list-none">
                  <tile.icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {tile.label}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tile.description}
                    </p>
                  </div>
                </summary>
                <div className="mt-3 border-t pt-3">
                  <ActionForm action={action} />
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
