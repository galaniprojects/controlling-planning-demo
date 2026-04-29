/**
 * v5 B2 — SandboxBorder.
 *
 * Wraps the workspace in a tinted border that signals "you're editing
 * a scenario sandbox, not live data". Per the v5 spec the sandbox is
 * always visually distinct from production surfaces (Workbench /
 * Charging) so the user can never confuse a scenario edit with a
 * canonical edit.
 */

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When true, a banner across the top reinforces the sandbox state. */
  showBanner?: boolean;
  /** Optional banner text override. */
  bannerText?: string;
}

export function SandboxBorder({
  children,
  showBanner = true,
  bannerText,
}: Props) {
  return (
    <div className="relative rounded-lg border-2 border-amber-300 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/10">
      {showBanner && (
        <div className="px-4 py-1.5 bg-amber-100 dark:bg-amber-900/30 border-b-2 border-amber-300 dark:border-amber-700/60 text-xs font-medium text-amber-800 dark:text-amber-300 rounded-t-md">
          {bannerText ??
            'Scenario sandbox — edits live in this scenario only and do not affect the canonical forecast or charging tables.'}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
