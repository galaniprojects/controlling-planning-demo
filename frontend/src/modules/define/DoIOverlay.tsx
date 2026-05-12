/**
 * DoIOverlay — sticky banner on the Define page surfacing the next-DoI
 * gate status. Replaces the "what unlocks the next DoI" mystery that
 * the popup-era workflow buried.
 *
 * Reads gate state from `GET /api/projects/{id}/pipeline`. Each
 * missing field is resolved to a `DoIFieldRequirement` via
 * `findRequirementByKeyOrLabel`, which carries the `target_tab` +
 * `field_anchor` needed for deep-linking. Clicking a missing field
 * switches to its tab and scrolls/focuses the anchor.
 *
 * Banner states:
 *   - DoI ≥ 3 (approved): success tone, "Open in Workbench" hint.
 *   - next gate satisfied: success tone, "Controller can advance".
 *   - missing fields present: amber, list of deep-links.
 *   - top of scale (next_doi=null): success tone.
 *   - no pipeline state (new project before first save): muted hint.
 */

import { CheckCircle2, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PipelineState } from '@/types/pipeline';
import {
  findRequirementByKeyOrLabel,
  type DefineTabId,
  type DoIFieldRequirement,
} from '@/modules/backlog/components/detail/DoIRequirementsRegistry';

interface Props {
  /** Latest pipeline state for the project, or null on `/define/new`. */
  pipeline: PipelineState | null;
  /** Switch to the given Define tab. */
  onNavigateToTab: (tab: DefineTabId, anchor?: string) => void;
  /** Navigate to Workbench (only meaningful at DoI ≥ 3). */
  onOpenWorkbench: () => void;
  /** `true` once project is created in DB and gating is meaningful. */
  hasProject: boolean;
  className?: string;
}

export function DoIOverlay({
  pipeline,
  onNavigateToTab,
  onOpenWorkbench,
  hasProject,
  className,
}: Props) {
  if (!hasProject) {
    return (
      <div
        className={cn(
          'rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
        role="status"
      >
        <p>
          Enter a project name and click <strong className="text-foreground">Save</strong> to
          create the project at DoI 0. The DoI overlay then surfaces the
          fields needed to advance to each gate.
        </p>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div
        className={cn(
          'rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
        role="status"
      >
        Loading DoI status…
      </div>
    );
  }

  const gate = pipeline.gate_status;
  const currentDoi = gate.current_doi ?? pipeline.doi ?? 0;
  const approved = currentDoi >= 3;

  // DoI ≥ 3 → project approved, point user at Workbench.
  if (approved) {
    return (
      <div
        className={cn(
          'rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3',
          className,
        )}
        role="status"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles
              className="size-4 mt-0.5 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            />
            <div className="text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Project approved — ready for execution.
              </p>
              <p className="text-emerald-700/80 dark:text-emerald-400/80">
                Operational forecasts, external costs, and cost allocation
                live in the Workbench.
              </p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={onOpenWorkbench}
            className="shrink-0"
          >
            Open in Workbench
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  // Top of scale on the current path (next_doi=null) but not yet DoI 3.
  if (gate.next_doi === null) {
    return (
      <div
        className={cn(
          'rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400',
          className,
        )}
        role="status"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden />
          <span>Project is at the highest DoI on its current path.</span>
        </div>
      </div>
    );
  }

  // Gate satisfied — controller can advance.
  if (gate.can_advance) {
    return (
      <div
        className={cn(
          'rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400',
          className,
        )}
        role="status"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden />
          <span>
            DoI {currentDoi} → {gate.next_doi}: gate satisfied. Controller
            can advance.
          </span>
        </div>
      </div>
    );
  }

  // Amber — list missing fields.
  const missing = gate.missing_fields ?? [];
  const resolved = missing.map((m) => ({
    raw: m,
    req: findRequirementByKeyOrLabel(m),
  }));

  return (
    <div
      className={cn(
        'rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3',
        className,
      )}
      role="status"
    >
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <AlertCircle className="size-4" aria-hidden />
        <span className="text-sm font-medium">
          DoI {currentDoi} → {gate.next_doi}: {missing.length} field
          {missing.length === 1 ? '' : 's'} to complete
        </span>
      </div>
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {resolved.map(({ raw, req }) => (
          <li key={raw}>
            {req ? (
              <DeepLinkButton
                requirement={req}
                onClick={() => onNavigateToTab(req.target_tab, req.field_anchor)}
              />
            ) : (
              <span className="flex items-start gap-2 text-amber-700/80 dark:text-amber-400/80">
                <span
                  className="mt-1.5 size-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
                  aria-hidden
                />
                <span>{raw}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {gate.override_available ? (
        <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-400/80">
          Controller may advance with an override + audit reason.
        </p>
      ) : null}
    </div>
  );
}

interface DeepLinkButtonProps {
  requirement: DoIFieldRequirement;
  onClick: () => void;
}

const TAB_LABEL: Record<DefineTabId, string> = {
  identity: 'Identity',
  tech_navigator: 'Tech Navigator',
  financials: 'Financials',
  approval_milestones: 'Approval & Milestones',
};

function DeepLinkButton({ requirement, onClick }: DeepLinkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-start gap-2 w-full text-left rounded px-1.5 py-1 -mx-1.5',
        'text-amber-700 dark:text-amber-400',
        'hover:bg-amber-100 dark:hover:bg-amber-900/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span
        className="mt-1.5 size-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
        aria-hidden
      />
      <span className="flex-1">
        <span className="font-medium">{requirement.label}</span>
        <span className="text-amber-700/70 dark:text-amber-400/70">
          {' — Tab: '}
          {TAB_LABEL[requirement.target_tab]}
        </span>
      </span>
      <ChevronRight
        className="size-3.5 mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}
