/**
 * DeclineInlineForm — inline expansion under an inbox row to capture
 * the decline reason for a project (v5.2 W3, Track D, spec §12.7).
 *
 * Used by `RequestRow.tsx`: when the user picks "Decline all" from
 * the row action dropdown, the row body expands to render this form.
 * On submit it calls `capacityApi.declineProject(projectId, reason)`,
 * marks the row "declined" (which triggers the strikethrough +
 * fade-out animation in `RequestRow`), and notifies the parent which
 * then re-fetches the inbox.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface DeclineInlineFormProps {
  /** Disable the submit button while parent is awaiting the API call. */
  isSubmitting?: boolean;
  /** Called with the trimmed reason text. Parent dispatches the API call. */
  onConfirm: (reason: string) => void;
  /** Cancel handler — collapse the form without submitting. */
  onCancel: () => void;
}

export function DeclineInlineForm({
  isSubmitting = false,
  onConfirm,
  onCancel,
}: DeclineInlineFormProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const valid = trimmed.length > 0;

  const submit = () => {
    if (!valid || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <label
        htmlFor="decline-reason"
        className="block text-xs font-medium text-foreground"
      >
        Decline reason
      </label>
      <Textarea
        id="decline-reason"
        autoFocus
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this project being declined? (e.g., 'No capacity in Q3 — re-submit after rebalancing.')"
        className="text-sm bg-card"
        disabled={isSubmitting}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={submit}
          disabled={!valid || isSubmitting}
        >
          {isSubmitting ? 'Declining…' : 'Confirm decline'}
        </Button>
      </div>
    </div>
  );
}
