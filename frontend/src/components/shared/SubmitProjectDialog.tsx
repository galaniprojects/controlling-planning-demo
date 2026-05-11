/**
 * SubmitProjectDialog — REMOVED in the Define-page redesign.
 *
 * The v5 popup-based intake dialog was replaced by the guided
 * `/define/new` page. The dialog form (name, description, LoB, type,
 * capex/opex, start/end month) has been re-homed in the Identity tab
 * of the Define page, where every field stays editable for the entire
 * project lifecycle.
 *
 * Callers should `navigate('/define/new')` instead of mounting this
 * component. A thin shim is exported as a deprecation aid so any
 * stragglers still importing `SubmitProjectDialog` don't break the
 * build during the redesign rollout.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** No-op in the new flow — Define page Save handles the redirect. */
  onSuccess?: () => void;
}

/**
 * Deprecation shim: when opened, immediately closes itself and routes
 * to `/define/new`. Emit a console warning so the lingering caller is
 * easy to find in dev tools.
 */
export function SubmitProjectDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    console.warn(
      'SubmitProjectDialog is deprecated — Define-page redesign uses /define/new. ' +
        'Replace this caller with `useNavigate()` → /define/new.',
    );
    onOpenChange(false);
    navigate('/define/new');
  }, [open, onOpenChange, navigate]);
  return null;
}
