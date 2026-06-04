/**
 * v5 B2 — Stale indicator.
 *
 * Shown next to the recalculate button when `stale=true` (any diff
 * mutation since the last impact recalculation). Click semantics live
 * in the parent — this is purely visual.
 */

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { parseServerTimestamp } from '@/lib/formatters';

interface Props {
  stale: boolean;
  lastRecalculatedAt?: string | null;
}

// F5: `last_recalculated_at` is a naive-UTC server timestamp — parse it as UTC
// via the shared `parseServerTimestamp` so the relative label isn't skewed by
// the viewer's offset.
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ts = parseServerTimestamp(iso);
  if (Number.isNaN(ts)) return iso;
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function StaleIndicator({ stale, lastRecalculatedAt }: Props) {
  if (stale) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Diffs changed since last recalc
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Recalculated {formatRelative(lastRecalculatedAt)}
    </div>
  );
}
