/**
 * Shared label helpers for `DistributionVersion` UI per FD-3 [F-S1-02..08].
 *
 * Centralises the rendering of version labels, badges, and date formatting
 * so the version selector, creation modal, diff view, and per-entity
 * history sidebar all read the same way.
 *
 * European date format (`DD.MM.YYYY`) per CLAUDE.md.
 */
import type {
  DistributionVersionOrigin,
  DistributionVersionResponse,
  DistributionVersionStatus,
} from '@/types/api';

/** Compact European date — `DD.MM.YYYY`. Returns `'—'` for null/empty. */
export function formatVersionDate(iso: string | null): string {
  if (!iso) return '—';
  // Be defensive — backend may send a full datetime ISO; trim to date prefix.
  const datePart = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Compact European datetime — `DD.MM.YYYY HH:MM`. */
export function formatVersionDateTime(iso: string | null): string {
  if (!iso) return '—';
  const [datePart, timePart = ''] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  const hhmm = timePart.slice(0, 5);
  return hhmm ? `${d}.${m}.${y} ${hhmm}` : `${d}.${m}.${y}`;
}

const ORIGIN_LABEL: Record<DistributionVersionOrigin, string> = {
  blank: 'Blank',
  copy_active: 'Copied from active',
  copy_prior: 'Copied from prior',
  seed: 'Seeded',
};

export function originLabel(origin: DistributionVersionOrigin): string {
  return ORIGIN_LABEL[origin];
}

const STATUS_LABEL: Record<DistributionVersionStatus, string> = {
  draft: 'Draft',
  active: 'Active',
};

export function statusLabel(status: DistributionVersionStatus): string {
  return STATUS_LABEL[status];
}

/**
 * Primary one-line label for a version — used in selectors and lists.
 * Active production: `Active · v17 · from 01.01.2026`.
 * Draft: `Draft · v18 · (no active_from)` or `Draft · v18 · scheduled 01.07.2026`.
 */
export function versionPrimaryLabel(v: DistributionVersionResponse): string {
  const id = `v${v.id}`;
  if (v.status === 'active') {
    return `Active · ${id} · from ${formatVersionDate(v.active_from)}`;
  }
  // draft
  if (v.active_from) {
    return `Draft · ${id} · scheduled ${formatVersionDate(v.active_from)}`;
  }
  return `Draft · ${id}`;
}

/** Secondary subtitle for richer renderings — origin + rationale preview. */
export function versionSubtitle(v: DistributionVersionResponse): string {
  const rationaleTrim = (v.rationale || '').trim();
  const preview = rationaleTrim
    ? rationaleTrim.length > 80
      ? rationaleTrim.slice(0, 80) + '…'
      : rationaleTrim
    : 'No rationale recorded';
  return `${originLabel(v.origin)} · ${preview}`;
}

/**
 * Resolve the "in-force" production version for the current date — the
 * latest active production version whose `active_from` is ≤ today.
 * Mirrors the backend resolver (`distribution_service.resolve_active_version`
 * per [F-S1-03]) so the toolbar selector pre-selects the same version
 * the cascade resolver would have picked server-side.
 *
 * Returns `null` when no active production version has yet taken effect
 * (e.g., a fresh repo with only a scheduled-future active row).
 *
 * Shared by `AllocationFlowView` (Session 4 toolbar) and
 * `EntityDistributionEditor` (Session 5 header) so the two surfaces
 * cannot drift on what "in force" means.
 */
export function pickInForceVersionId(
  versions: DistributionVersionResponse[],
): number | null {
  const today = new Date().toISOString().slice(0, 10);
  let best: DistributionVersionResponse | null = null;
  for (const v of versions) {
    if (v.scenario_id !== null) continue;
    if (v.status !== 'active') continue;
    if (!v.active_from || v.active_from > today) continue;
    if (!best || (v.active_from ?? '') > (best.active_from ?? '')) {
      best = v;
    }
  }
  return best?.id ?? null;
}
