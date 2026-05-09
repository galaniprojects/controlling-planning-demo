/**
 * RequestsInbox — Resource Requests triage queue (v5.2 W3, Track D).
 *
 * Route: `/capacity/requests`
 * Roles: Controller (all CCs), CC Owner (auto-scoped to managed CC).
 * Executives + PLs are filtered out by `CapacityModuleNav` /
 * `CapacityWorkspace` respectively.
 *
 * Page composition (per spec §12.2):
 *   - Page header (sub-section title only — the module header is owned
 *     by `CapacityManagement.tsx`, the route's layout host).
 *   - Filter bar (§12.4).
 *   - Request table (§12.3).
 *   - Recently completed section, collapsed by default (§12.8).
 *
 * Active filter state is mirrored in the URL query string via
 * `useSearchParams({ replace: true })` so the back button doesn't
 * accumulate filter changes (per the team-lead's brief).
 *
 * Decline flow (§12.7):
 *   - User picks "Decline all" from the row dropdown → DeclineInlineForm
 *     expands beneath the row.
 *   - On confirm: call `capacityApi.declineProject(projectId, reason)`,
 *     mark the row as "declining" → row gets a strikethrough + fade-out
 *     animation for ~3 seconds, after which we re-fetch the inbox AND
 *     bump the recently-completed nonce so that section refreshes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, Loader2 } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { Skeleton } from '@/components/shared/Skeleton';
import { capacityApi } from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import type {
  CapacityInboxFilters,
  CapacityInboxItem,
  CapacityInboxStatus,
  CapacityInboxResponse,
} from '@/types/api';
import {
  InboxFilterBar,
  type DropdownOption,
  type InboxFilterValue,
} from './requests/InboxFilterBar';
import {
  RequestTable,
  inboxRowKey,
  type SortColumn,
  type SortDir,
} from './requests/RequestTable';
import { RecentlyCompletedSection } from './requests/RecentlyCompletedSection';
import { resolvePersonaPersonId } from './shared/personaPersonId';

// ---------------------------------------------------------------------------
// URL <-> state helpers
// ---------------------------------------------------------------------------

const STATUS_KEY = 'status';
const ROLE_KEY = 'role';
const PL_KEY = 'pl';
const CC_KEY = 'cc';
const SORT_KEY = 'sort';
const DIR_KEY = 'dir';

const VALID_STATUSES: ReadonlyArray<CapacityInboxStatus | 'all'> = [
  'all',
  'new',
  'in_progress',
  're_confirm',
];

const VALID_SORT_COLUMNS: ReadonlyArray<SortColumn> = [
  'project_name',
  'pl_name',
  'cc_name',
  'unassigned_hours',
  'age_days',
  'priority',
  'status',
];

function readFilterFromUrl(params: URLSearchParams): InboxFilterValue {
  const rawStatus = params.get(STATUS_KEY) ?? 'all';
  const status = (
    VALID_STATUSES as ReadonlyArray<string>
  ).includes(rawStatus)
    ? (rawStatus as CapacityInboxStatus | 'all')
    : 'all';

  const splitOrEmpty = (key: string): string[] => {
    const raw = params.get(key);
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  };

  return {
    status,
    roleTypeIds: splitOrEmpty(ROLE_KEY),
    plPersonIds: splitOrEmpty(PL_KEY),
    ccIds: splitOrEmpty(CC_KEY),
  };
}

function writeFilterToUrl(
  params: URLSearchParams,
  next: InboxFilterValue,
): URLSearchParams {
  const u = new URLSearchParams(params);
  if (next.status === 'all') u.delete(STATUS_KEY);
  else u.set(STATUS_KEY, next.status);

  if (next.roleTypeIds.length) u.set(ROLE_KEY, next.roleTypeIds.join(','));
  else u.delete(ROLE_KEY);

  if (next.plPersonIds.length) u.set(PL_KEY, next.plPersonIds.join(','));
  else u.delete(PL_KEY);

  if (next.ccIds.length) u.set(CC_KEY, next.ccIds.join(','));
  else u.delete(CC_KEY);

  return u;
}

function readSortFromUrl(params: URLSearchParams): {
  column: SortColumn;
  dir: SortDir;
} {
  const rawCol = params.get(SORT_KEY);
  const column = (VALID_SORT_COLUMNS as ReadonlyArray<string>).includes(
    rawCol ?? '',
  )
    ? (rawCol as SortColumn)
    : 'priority';
  const rawDir = params.get(DIR_KEY);
  const dir: SortDir = rawDir === 'asc' ? 'asc' : 'desc';
  return { column, dir };
}

function filterValueToApiPayload(
  value: InboxFilterValue,
): CapacityInboxFilters {
  return {
    status: value.status,
    role_type_id: value.roleTypeIds.length ? value.roleTypeIds : undefined,
    pl_person_id: value.plPersonIds.length ? value.plPersonIds : undefined,
    cost_center_id: value.ccIds.length ? value.ccIds : undefined,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STRIKETHROUGH_MS = 3000;

export default function RequestsInbox() {
  const { context, currentRoleId } = useRole();
  const role = context?.role;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // v5.2 W6 Track C — §15 permission sweep. The Requests inbox is
  // restricted to controller + cost_center_owner per the §12.1 nav.
  // Direct URL access by Project Lead or Executive (which the
  // CapacityModuleNav hides) would otherwise hit a 403 on the inbox
  // fetch and render an error banner. Redirect to the workspace (the
  // workspace itself redirects PL onward to /capacity/availability).
  if (role && role !== 'controller' && role !== 'cost_center_owner') {
    return <Navigate to="/capacity" replace />;
  }

  const [items, setItems] = useState<CapacityInboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentRefreshNonce, setRecentRefreshNonce] = useState(0);

  // Set of "{pid}::{ccid}::{cr|new}" keys that are currently animating out.
  const [decliningKeys, setDecliningKeys] = useState<Set<string>>(new Set());
  const declineTimers = useRef<Map<string, number>>(new Map());

  const filters = useMemo(
    () => readFilterFromUrl(searchParams),
    [searchParams],
  );
  const sort = useMemo(() => readSortFromUrl(searchParams), [searchParams]);

  const isCcOwner = role === 'cost_center_owner';
  const showCostCenter = !isCcOwner;
  const recentFilterPersonId = isCcOwner
    ? undefined
    : resolvePersonaPersonId(currentRoleId);

  // --- Fetch inbox ---
  const fetchInbox = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res: CapacityInboxResponse = await capacityApi.getInbox(
          filterValueToApiPayload(filters),
        );
        if (signal?.aborted) return;
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load inbox');
        setItems([]);
        setTotal(0);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchInbox(controller.signal);
    return () => controller.abort();
  }, [fetchInbox]);

  // Cleanup any pending strikethrough timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of declineTimers.current.values()) {
        window.clearTimeout(t);
      }
      declineTimers.current.clear();
    };
  }, []);

  // --- Filter / sort state writers ---

  const updateFilter = (next: InboxFilterValue) => {
    const u = writeFilterToUrl(searchParams, next);
    setSearchParams(u, { replace: true });
  };

  const updateSort = (next: SortColumn) => {
    const u = new URLSearchParams(searchParams);
    if (sort.column === next) {
      u.set(DIR_KEY, sort.dir === 'asc' ? 'desc' : 'asc');
    } else {
      u.set(SORT_KEY, next);
      // Numeric / categorical defaults to descending (most-relevant first);
      // alphabetic ones default to ascending.
      const numericOrCategorical: SortColumn[] = [
        'unassigned_hours',
        'age_days',
        'priority',
        'status',
      ];
      u.set(DIR_KEY, numericOrCategorical.includes(next) ? 'desc' : 'asc');
    }
    setSearchParams(u, { replace: true });
  };

  // --- Decline orchestration (§12.7) ---

  const handleDecline = useCallback(
    async (projectId: string, ccId: string, reason: string) => {
      // Find the row key so we can target the strikethrough + remove it
      // from state after the animation completes.
      const target = items.find(
        (it) => it.project_id === projectId && it.cc_id === ccId,
      );
      if (!target) return;
      const key = inboxRowKey(target);

      await capacityApi.declineProject(projectId, reason);

      // Mark the row as declining so the row CSS animates the strikethrough
      // + fade-out. After STRIKETHROUGH_MS, re-fetch the inbox + bump the
      // recently-completed nonce to surface the new audit-log entry.
      setDecliningKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      const timer = window.setTimeout(() => {
        declineTimers.current.delete(key);
        setDecliningKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        // Re-fetch to drop the row from the inbox + refresh the
        // recently-completed section with the new entry.
        fetchInbox();
        setRecentRefreshNonce((n) => n + 1);
      }, STRIKETHROUGH_MS);
      declineTimers.current.set(key, timer);
    },
    [items, fetchInbox],
  );

  const handleReviewAssign = (projectId: string, ccId: string) => {
    navigate(
      `/capacity?assignment_project=${encodeURIComponent(
        projectId,
      )}&cc=${encodeURIComponent(ccId)}`,
    );
  };

  // --- Filter dropdown options derived from the full payload ---
  // Per §12.4 the role/PL/CC dropdowns list values present in the current
  // request set. We compute them off the current `items` so empty filters
  // shrink the lists naturally as the queue clears.

  const roleOptions: DropdownOption[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      for (const b of it.role_badges) map.set(b.role_type_id, b.role_name);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const plOptions: DropdownOption[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.pl_person_id && it.pl_name) map.set(it.pl_person_id, it.pl_name);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const ccOptions: DropdownOption[] = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) map.set(it.cc_id, it.cc_name);
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Resource Requests"
        subtitle="Triage queue for incoming and re-confirmation requests."
      />

      <InboxFilterBar
        value={filters}
        onChange={updateFilter}
        roleOptions={roleOptions}
        plOptions={plOptions}
        ccOptions={ccOptions}
        hideCcFilter={isCcOwner}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              {total} pending {total === 1 ? 'item' : 'items'}
            </span>
            {loading && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing…
              </span>
            )}
          </div>

          <RequestTable
            items={items}
            showCostCenter={showCostCenter}
            decliningKeys={decliningKeys}
            sortColumn={sort.column}
            sortDir={sort.dir}
            onSortChange={updateSort}
            onDecline={handleDecline}
            onReviewAssign={handleReviewAssign}
          />
        </>
      )}

      <RecentlyCompletedSection
        filterByPersonId={recentFilterPersonId}
        refreshNonce={recentRefreshNonce}
        hideCostCenter={isCcOwner}
      />
    </div>
  );
}
