/**
 * Dimension 4 — People impact (Tier 3 only).
 *
 * Per spec line 1058 + CLAUDE.md Tier-3 redaction rules: this component
 * renders `null` for non-Tier-3 users. The strip ALSO removes the People
 * tile entirely for non-Tier-3 users, so this `null` return is a
 * defense-in-depth check — should never render in production for a non-
 * Tier-3 caller.
 *
 * Backend already redacts the dimension server-side: when `tier3_visible
 * === false` the dimension comes back as
 * `{ tier: 3, redacted: true, headline: 'Tier 3 — restricted' }`.
 * We trust the absence + the explicit `redacted` flag.
 */

import { UserCog, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { PeopleDimensionData } from '../../../lib/impactTypes';

interface PeopleDimensionProps {
  data: PeopleDimensionData | undefined;
  tier3Visible: boolean;
}

export function PeopleDimension({ data, tier3Visible }: PeopleDimensionProps) {
  // Defense-in-depth: never render for non-Tier-3 users.
  if (!tier3Visible) return null;

  if (!data || data.redacted) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <Lock className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Tier 3 restricted</p>
          <p className="text-muted-foreground mt-0.5">
            People-level diffs are hidden from this view.
          </p>
        </div>
      </Card>
    );
  }

  const total = data.action_count ?? 0;
  if (total === 0) {
    return (
      <Card className="px-4 py-6 bg-card flex items-center gap-3">
        <UserCog className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No Tier 3 people changes in this scenario.
        </p>
      </Card>
    );
  }

  const byType = data.by_type ?? {};
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      <Card className="px-4 py-3 bg-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Total Tier 3 actions
        </p>
        <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
          {total}
        </p>
      </Card>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Action type</th>
              <th className="text-right px-3 py-2 font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([t, c]) => (
              <tr key={t} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{t}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                  {c}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
