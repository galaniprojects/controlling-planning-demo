/**
 * v5 B2 — Change-summary feed helpers.
 *
 * The change summary feed (rendered by the drawer) shows the user's
 * recent diffs against the live forecast. The provider in
 * `ScenarioContext.tsx` appends entries optimistically; this module
 * provides label / formatting helpers shared between provider and
 * drawer.
 */

import type { ChangeSummaryEntry, ChangeSummaryKind } from '../ScenarioContext';

const KIND_LABELS: Record<ChangeSummaryKind, string> = {
  action: 'Action',
  cost_allocation_distribution: 'Stage 1 distribution',
  cost_allocation_btc: 'Stage 2 BTC',
  cost_allocation_to_business: 'To-business %',
  metadata: 'Metadata',
  lifecycle: 'Lifecycle',
  promote: 'Promote',
  apply: 'Apply',
};

export function changeKindLabel(kind: ChangeSummaryKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export function formatRelativeTime(timestampMs: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestampMs);
  const seconds = Math.round(diff / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function entriesByKind(
  entries: ChangeSummaryEntry[],
): Map<ChangeSummaryKind, ChangeSummaryEntry[]> {
  const map = new Map<ChangeSummaryKind, ChangeSummaryEntry[]>();
  for (const e of entries) {
    const list = map.get(e.kind) ?? [];
    list.push(e);
    map.set(e.kind, list);
  }
  return map;
}
