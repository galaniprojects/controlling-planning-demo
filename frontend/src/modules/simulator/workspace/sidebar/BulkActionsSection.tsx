/**
 * v5 B2 — Sidebar section: Bulk Actions.
 *
 * Mounts the catalogue panel inside the workspace sidebar (T1's
 * `WorkspaceSidebar` host renders this body). Tier 3 actions are
 * filtered out at panel level, not here — keeping this section as a
 * thin host so T1's host can show / hide the entire section based on
 * its own composition rules.
 */

import { BulkActionsPanel } from '../../catalogue/BulkActionsPanel';

interface Props {
  /** Optional preset project for project-scope actions (passed through to the catalogue). */
  presetProjectId?: string;
}

export function BulkActionsSection({ presetProjectId }: Props) {
  return (
    <div className="space-y-3 px-1">
      <BulkActionsPanel presetProjectId={presetProjectId} />
    </div>
  );
}
