/**
 * Sticky action bar at the bottom of the editor — Discard / Save /
 * Show-preview toggle. Spec §5.6 + §5.7.
 *
 * - Discard resets pending to the server snapshot. Disabled when not
 *   dirty.
 * - Save fires the batched orchestrator. Disabled when not dirty OR
 *   when the sum bar reports over-allocated.
 * - Show preview toggles the side panel.
 *
 * Hidden entirely (replaced by a read-only banner) on active versions.
 */
import { Save, RotateCcw, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  dirty: boolean;
  saving: boolean;
  isOverAllocated: boolean;
  sidePanelOpen: boolean;
  readOnly: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onToggleSidePanel: () => void;
}

export function EditorActionBar({
  dirty,
  saving,
  isOverAllocated,
  sidePanelOpen,
  readOnly,
  onSave,
  onDiscard,
  onToggleSidePanel,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
      <Button variant="outline" size="sm" onClick={onToggleSidePanel}>
        {sidePanelOpen ? (
          <>
            <PanelRightClose className="h-3.5 w-3.5 mr-1.5" />
            Hide allocation preview
          </>
        ) : (
          <>
            <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />
            Show allocation preview
          </>
        )}
      </Button>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={!dirty || saving}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Discard changes
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving || isOverAllocated}
            title={
              isOverAllocated
                ? 'Reduce total allocation to ≤100% before saving.'
                : !dirty
                ? 'No pending changes.'
                : undefined
            }
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save distribution'}
          </Button>
        </div>
      )}
    </div>
  );
}
