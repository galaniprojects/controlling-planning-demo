/**
 * v5 B2 — Catalogue wrapper helper.
 *
 * Tiny factory that turns an `ActionDefinition` id into a self-contained
 * React component rendering the shared `ActionForm` for that action.
 * Used by the per-action thin wrappers in `portfolioRules/`,
 * `targetSetters/`, `restructuring/`. (Project-scope actions were retired
 * as catalogue inputs — they are authored directly in the forecast grid.)
 */

import { ActionForm } from './ActionForm';
import { findActionById } from './catalogueDef';

interface CatalogueWrapperProps {
  presetProjectId?: string;
  onCancel?: () => void;
  onApplied?: () => void;
}

export function makeCatalogueWrapper(actionId: string) {
  const Component = (props: CatalogueWrapperProps) => {
    const action = findActionById(actionId);
    if (!action) {
      // Defensive — should never happen because actionId is a literal.
      return (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Catalogue action <code>{actionId}</code> not found.
        </div>
      );
    }
    return <ActionForm action={action} {...props} />;
  };
  Component.displayName = `CatalogueAction(${actionId})`;
  return Component;
}
