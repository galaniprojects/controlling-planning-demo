/**
 * v5 B2 — Sidebar section: Resources (Tier 3 only).
 *
 * Tier-3 specific section that surfaces the People Master and Capacity
 * Parameters surfaces alongside the four restructuring catalogue
 * actions. Returns `null` entirely when `useTier3()` is false — hidden
 * DOM, NOT a disabled state — per `[B-AC-02]` security pattern.
 *
 * Selecting an entry navigates the workspace to the corresponding
 * surface key. The actual surface components live under `surfaces/`.
 */

import { ChevronRight, Sliders, UserPlus, UserMinus, Users, MoveRight } from 'lucide-react';
import { useTier3 } from '../../permissions';
import { useScenarioContext } from '../../useScenarioContext';
import { Badge } from '@/components/ui/badge';

interface Props {
  /** Called when the user picks a surface or restructuring action.
   *  T1's WorkspaceSidebar should map (surfaceKey | actionId) to a
   *  workspace navigation. Falls back to a no-op if not provided. */
  onSelectSurface?: (
    target:
      | { kind: 'surface'; surfaceKey: 'people_master' | 'capacity_parameters' }
      | { kind: 'action'; actionId: string },
  ) => void;
}

interface ResourceEntry {
  id: string;
  label: string;
  description: string;
  icon: typeof Sliders;
  target:
    | { kind: 'surface'; surfaceKey: 'people_master' | 'capacity_parameters' }
    | { kind: 'action'; actionId: string };
}

const RESOURCE_ENTRIES: ResourceEntry[] = [
  {
    id: 'people-master',
    label: 'People master data',
    description: 'Hire, depart, or reassign people in the sandbox.',
    icon: Users,
    target: { kind: 'surface', surfaceKey: 'people_master' },
  },
  {
    id: 'capacity-parameters',
    label: 'Capacity parameters',
    description: 'Adjust available hours per location.',
    icon: Sliders,
    target: { kind: 'surface', surfaceKey: 'capacity_parameters' },
  },
  {
    id: 'remove-role',
    label: 'Remove role from portfolio',
    description: 'Cascade: zero allocations, surface affected projects.',
    icon: UserMinus,
    target: { kind: 'action', actionId: 'remove-role' },
  },
  {
    id: 'reduce-headcount',
    label: 'Reduce headcount by location',
    description: 'Tighten supply pool by N people or N%.',
    icon: Users,
    target: { kind: 'action', actionId: 'reduce-headcount' },
  },
  {
    id: 'relocate-team',
    label: 'Relocate team',
    description: 'Move headcount block between locations.',
    icon: MoveRight,
    target: { kind: 'action', actionId: 'relocate-team' },
  },
  {
    id: 'hire-block',
    label: 'Hire block',
    description: 'Add hypothetical FTEs to the capacity pool.',
    icon: UserPlus,
    target: { kind: 'action', actionId: 'hire-block' },
  },
];

export function ResourcesSection({ onSelectSurface }: Props) {
  const { tier3Visible } = useScenarioContext();
  const hasTier3 = useTier3({ impactTier3Visible: tier3Visible });

  // Hidden DOM — render nothing for non-Tier-3 users.
  if (!hasTier3) return null;

  return (
    <div className="space-y-3 px-1">
      <header className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">Resources</h3>
        <Badge
          variant="outline"
          className="border-amber-300 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400"
        >
          Tier 3
        </Badge>
      </header>
      <p className="text-xs text-muted-foreground">
        People and capacity changes. Promote routes these to HR action items.
      </p>
      <ul className="space-y-1.5">
        {RESOURCE_ENTRIES.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelectSurface?.(entry.target)}
              className="group flex w-full items-start gap-2 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <entry.icon className="mt-0.5 h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{entry.label}</div>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
