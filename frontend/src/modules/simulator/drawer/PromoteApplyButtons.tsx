/**
 * v5 B2 — PromoteApplyButtons slot.
 *
 * Empty slot owned by T1 in the drawer footer; T4 will fill it with
 * the Promote button (controller-only) and any companion controls.
 * Apply-to-forecast (PL) is rendered in the workspace header instead.
 */

import type { ReactNode } from 'react';

interface Props {
  /** T4 will render its Promote button via this prop. */
  children?: ReactNode;
}

export function PromoteApplyButtons({ children }: Props) {
  if (!children) return null;
  return (
    <div className="px-3 py-2 border-t border-border flex items-center justify-end gap-2">
      {children}
    </div>
  );
}
