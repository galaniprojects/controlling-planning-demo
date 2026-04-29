/**
 * v5 B2 — BulkActionsPanel.
 *
 * Master entry point for the 21+ catalogue actions. Renders a tile grid
 * grouped by category. Selecting a tile reveals the shared `ActionForm`
 * for that action. Restructuring (Tier 3) is filtered out of the action
 * list entirely when `useTier3()` returns false — hidden DOM, NOT
 * disabled tiles, per `[B-AC-02]` security pattern.
 *
 * Mounted from:
 *   - WorkspaceSidebar (`workspace/sidebar/BulkActionsSection.tsx`)
 *   - Header "Bulk actions" button (T1's ScenarioHeader exposes a slot)
 *   - Header chevron in compact mode → opens this panel as a sheet
 *
 * The panel is a dumb client component: it owns no scenario state,
 * delegating apply via `ActionForm` → `useScenarioContext().applyAction`.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTier3 } from '../permissions';
import { useScenarioContext } from '../useScenarioContext';
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  visibleActions,
} from './catalogueDef';
import type { ActionDefinition } from './types';
import { ActionForm } from './ActionForm';

interface Props {
  /**
   * Optional preset project for project-scope actions opened from a
   * project context (e.g. a project tile in the sidebar).
   */
  presetProjectId?: string;
  /** Optional callback when the user navigates back from a selected action. */
  onClose?: () => void;
}

type CategoryId = ActionDefinition['category'];
const CATEGORY_ORDER: CategoryId[] = [
  'projectLevel',
  'portfolioRules',
  'targetSetters',
  'restructuring',
];

export function BulkActionsPanel({ presetProjectId, onClose }: Props) {
  const hasTier3 = useTier3({
    impactTier3Visible: useScenarioContext().tier3Visible,
  });
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const actionsByCategory = useMemo(() => {
    const all = visibleActions(hasTier3);
    const out: Record<CategoryId, ActionDefinition[]> = {
      projectLevel: [],
      portfolioRules: [],
      targetSetters: [],
      restructuring: [],
    };
    for (const a of all) out[a.category].push(a);
    return out;
  }, [hasTier3]);

  const selected = useMemo(
    () =>
      selectedActionId
        ? visibleActions(hasTier3).find((a) => a.id === selectedActionId) ?? null
        : null,
    [selectedActionId, hasTier3],
  );

  if (selected) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSelectedActionId(null)}
          className="-ml-2 h-7 text-muted-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          All actions
        </Button>
        <ActionForm
          action={selected}
          presetProjectId={selected.requiresProject ? presetProjectId : undefined}
          onCancel={() => {
            setSelectedActionId(null);
            onClose?.();
          }}
          onApplied={() => {
            // Stay on the form so the user can apply variants quickly.
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Bulk actions
          </h3>
          <p className="text-xs text-muted-foreground">
            Pick a catalogue action to generate cell-level diffs in one step.
          </p>
        </div>
      </header>

      {CATEGORY_ORDER.map((cat) => {
        const items = actionsByCategory[cat];
        if (!items || items.length === 0) return null;
        return (
          <CategorySection
            key={cat}
            title={CATEGORY_LABELS[cat]}
            description={CATEGORY_DESCRIPTIONS[cat]}
            actions={items}
            tier3Section={cat === 'restructuring'}
            onSelect={(a) => setSelectedActionId(a.id)}
          />
        );
      })}
    </div>
  );
}

interface SectionProps {
  title: string;
  description: string;
  actions: ActionDefinition[];
  tier3Section?: boolean;
  onSelect: (a: ActionDefinition) => void;
}

function CategorySection({
  title,
  description,
  actions,
  tier3Section,
  onSelect,
}: SectionProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {tier3Section && (
          <Badge
            variant="outline"
            className="border-amber-300 text-[10px] uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:text-amber-400"
          >
            Tier 3
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((a) => (
          <ActionTile key={a.id} action={a} onClick={() => onSelect(a)} />
        ))}
      </div>
    </section>
  );
}

function ActionTile({
  action,
  onClick,
}: {
  action: ActionDefinition;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-1 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex w-full items-center gap-1.5">
        <span className="flex-1 text-sm font-medium text-foreground group-hover:text-primary">
          {action.label}
        </span>
        {action.informational && (
          <Badge
            variant="outline"
            className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-700 dark:text-amber-400"
          >
            Info
          </Badge>
        )}
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {action.description}
      </p>
    </button>
  );
}
