/**
 * CapacityHistory — chronological audit trail of capacity actions
 * (v5.2 W3, Track D, spec §12.9 / §12.11).
 *
 * Route: `/capacity/history`
 * Roles: Controller (all CCs, all users), CC Owner (auto-scoped to
 * managed CC), Executive (read-only, all CCs). PLs are blocked
 * server-side.
 *
 * Page composition (per spec §12.11):
 *   - Sub-section header.
 *   - Filter bar (§12.12).
 *   - History table (§12.13).
 *   - Pagination.
 *
 * Default filter rules per the team-lead brief and §12.12:
 *   - CC Owner   → user = "Me" (current persona's person_id).
 *   - Controller → user = "All".
 *   - Executive  → user = "All".
 *   - Date range → last 30 days from "today" (the JS Date).
 *
 * URL state mirrors the filters via `useSearchParams({ replace: true })`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ModuleHeader } from '@/components/shared/ModuleHeader';
import { Skeleton } from '@/components/shared/Skeleton';
import {
  capacityApi,
  rolesApi,
  referenceApi,
  workbenchApi,
} from '@/api/endpoints';
import { useRole } from '@/contexts/RoleContext';
import type {
  CapacityHistoryEntry,
  CapacityHistoryFilters,
  CapacityHistoryResponse,
  RefCostCenter,
  RoleInfo,
  WorkbenchProjectListItem,
} from '@/types/api';
import {
  HistoryFilterBar,
  ALL_ACTION_TYPES,
  type DropdownOption,
  type HistoryActionFilter,
  type HistoryFilterValue,
} from './history/HistoryFilterBar';
import {
  HistoryTable,
  type HistorySortColumn,
  type HistorySortDir,
} from './history/HistoryTable';
import { Pagination } from './shared/Pagination';
import { resolvePersonaPersonId } from './shared/personaPersonId';

// ---------------------------------------------------------------------------
// Constants & URL helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;
const ME_SENTINEL = 'me';

const USER_KEY = 'user';
const ACTION_KEY = 'action';
const CC_KEY = 'cc';
const PROJECT_KEY = 'project';
const FROM_KEY = 'from';
const TO_KEY = 'to';
const PAGE_KEY = 'page';
const SORT_KEY = 'sort';
const DIR_KEY = 'dir';

const VALID_ACTIONS: ReadonlyArray<HistoryActionFilter> = ALL_ACTION_TYPES;
const VALID_SORT_COLUMNS: ReadonlyArray<HistorySortColumn> = [
  'timestamp',
  'acting_user_id',
  'action_type',
  'project_id',
  'cost_center_id',
];

function isoDateMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFilterForRole(
  role: string | undefined,
): HistoryFilterValue {
  return {
    actingUserId: role === 'cost_center_owner' ? ME_SENTINEL : 'all',
    actionTypes: ALL_ACTION_TYPES,
    ccIds: [],
    projectId: 'all',
    from: isoDateMinusDays(30),
    to: isoToday(),
  };
}

function readFiltersFromUrl(
  params: URLSearchParams,
  fallback: HistoryFilterValue,
): HistoryFilterValue {
  const splitOrEmpty = (key: string): string[] => {
    const raw = params.get(key);
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  };

  const rawActions = splitOrEmpty(ACTION_KEY).filter(
    (v): v is HistoryActionFilter =>
      (VALID_ACTIONS as ReadonlyArray<string>).includes(v),
  );

  return {
    actingUserId: params.get(USER_KEY) ?? fallback.actingUserId,
    actionTypes: rawActions.length ? rawActions : fallback.actionTypes,
    ccIds: splitOrEmpty(CC_KEY),
    projectId: params.get(PROJECT_KEY) ?? 'all',
    from: params.get(FROM_KEY) ?? fallback.from,
    to: params.get(TO_KEY) ?? fallback.to,
  };
}

function writeFiltersToUrl(
  params: URLSearchParams,
  next: HistoryFilterValue,
  fallback: HistoryFilterValue,
): URLSearchParams {
  const u = new URLSearchParams(params);

  if (next.actingUserId === fallback.actingUserId) u.delete(USER_KEY);
  else u.set(USER_KEY, next.actingUserId);

  if (
    next.actionTypes.length === ALL_ACTION_TYPES.length &&
    ALL_ACTION_TYPES.every((a) => next.actionTypes.includes(a))
  ) {
    u.delete(ACTION_KEY);
  } else {
    u.set(ACTION_KEY, next.actionTypes.join(','));
  }

  if (next.ccIds.length) u.set(CC_KEY, next.ccIds.join(','));
  else u.delete(CC_KEY);

  if (next.projectId === 'all') u.delete(PROJECT_KEY);
  else u.set(PROJECT_KEY, next.projectId);

  if (next.from === fallback.from) u.delete(FROM_KEY);
  else u.set(FROM_KEY, next.from);

  if (next.to === fallback.to) u.delete(TO_KEY);
  else u.set(TO_KEY, next.to);

  // Filter changes reset page to 1.
  u.delete(PAGE_KEY);

  return u;
}

function readSortFromUrl(params: URLSearchParams): {
  column: HistorySortColumn;
  dir: HistorySortDir;
} {
  const rawCol = params.get(SORT_KEY);
  const column = (VALID_SORT_COLUMNS as ReadonlyArray<string>).includes(
    rawCol ?? '',
  )
    ? (rawCol as HistorySortColumn)
    : 'timestamp';
  const rawDir = params.get(DIR_KEY);
  const dir: HistorySortDir = rawDir === 'asc' ? 'asc' : 'desc';
  return { column, dir };
}

function readPageFromUrl(params: URLSearchParams): number {
  const raw = parseInt(params.get(PAGE_KEY) ?? '1', 10);
  if (Number.isNaN(raw) || raw < 1) return 1;
  return raw;
}

// Filter-value → API payload, resolving the "Me" sentinel into the
// current persona's person id.
function buildApiPayload(
  value: HistoryFilterValue,
  page: number,
  sortColumn: HistorySortColumn,
  sortDir: HistorySortDir,
  selfPersonId: string | undefined,
): CapacityHistoryFilters {
  let actingUserId: string | undefined;
  if (value.actingUserId === 'all') {
    actingUserId = undefined;
  } else if (value.actingUserId === ME_SENTINEL) {
    actingUserId = selfPersonId;
  } else {
    actingUserId = value.actingUserId;
  }

  const actionTypes =
    value.actionTypes.length === ALL_ACTION_TYPES.length
      ? undefined
      : value.actionTypes;

  return {
    acting_user_id: actingUserId,
    action_type: actionTypes,
    cost_center_id: value.ccIds.length ? value.ccIds : undefined,
    project_id: value.projectId === 'all' ? undefined : value.projectId,
    from: value.from || undefined,
    to: value.to || undefined,
    page,
    page_size: PAGE_SIZE,
    sort: sortColumn,
    sort_dir: sortDir,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CapacityHistory() {
  const { context, currentRoleId } = useRole();
  const role = context?.role;
  const isCcOwner = role === 'cost_center_owner';
  const showCostCenter = !isCcOwner;
  const selfPersonId = resolvePersonaPersonId(currentRoleId);
  const personaUserName = context?.user_name;

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // v5.2 W6 Track C — §15 permission sweep. The History audit log is
  // restricted to controller / cc_owner / executive per §12.1; PL never
  // sees the nav and would otherwise hit a 403 on direct URL access.
  // Redirect to the workspace, which then bounces PL to /availability.
  //
  // v5.2 W6 review fix (P1.3) — drive the redirect from a useEffect so
  // we don't early-return *before* the hooks below, which would change
  // the hook count across renders. See RequestsInbox.tsx for the same
  // pattern + rationale.
  const isAuthorized =
    !role ||
    role === 'controller' ||
    role === 'cost_center_owner' ||
    role === 'executive';

  const fallback = useMemo(() => defaultFilterForRole(role), [role]);
  const filters = useMemo(
    () => readFiltersFromUrl(searchParams, fallback),
    [searchParams, fallback],
  );
  const sort = useMemo(() => readSortFromUrl(searchParams), [searchParams]);
  const page = useMemo(() => readPageFromUrl(searchParams), [searchParams]);

  const [items, setItems] = useState<CapacityHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter dropdown options (loaded once on mount).
  const [userOptions, setUserOptions] = useState<DropdownOption[]>([]);
  const [ccOptions, setCcOptions] = useState<DropdownOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<DropdownOption[]>([]);

  useEffect(() => {
    // v5.2 W6 review-pass-2 fix (P2.A) — skip dropdown-options fetches
    // when the user isn't authorized; the redirect effect above will
    // navigate them away. Without this guard we'd fire 4 stray fetches
    // (history + roles + ccs + projects) that 403 before redirect.
    if (role && !isAuthorized) return;
    let cancelled = false;

    rolesApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        // Demo personas → person_id options. PL is filtered out because
        // they don't act on capacity (and the spec doesn't surface them
        // in the audit log).
        const opts: DropdownOption[] = res.items
          .filter((r: RoleInfo) => r.id !== 'persona-pl')
          .map((r: RoleInfo) => {
            const personId = resolvePersonaPersonId(r.id);
            return personId
              ? {
                  value: personId,
                  label: r.user_name,
                  hint: r.user_title ?? undefined,
                }
              : null;
          })
          .filter((x): x is DropdownOption => x !== null);
        setUserOptions(opts);
      })
      .catch(() => {
        if (cancelled) return;
        setUserOptions([]);
      });

    referenceApi
      .getCostCenters()
      .then((res) => {
        if (cancelled) return;
        const opts: DropdownOption[] = res.items
          .filter((c: RefCostCenter) => c.is_active)
          .map((c: RefCostCenter) => ({
            value: c.id,
            label: c.name,
            hint: c.location_name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setCcOptions(opts);
      })
      .catch(() => {
        if (cancelled) return;
        setCcOptions([]);
      });

    workbenchApi
      .getProjects()
      .then((res) => {
        if (cancelled) return;
        const opts: DropdownOption[] = res.items
          .map((p: WorkbenchProjectListItem) => ({
            value: p.id,
            label: p.name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setProjectOptions(opts);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectOptions([]);
      });

    return () => {
      cancelled = true;
    };
    // P2.A — re-run if the gate flips so an authorized user navigating
    // back from a redirect still gets dropdown options populated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isAuthorized]);

  // Optional "Me" entry for the user dropdown — only when the persona
  // resolves to a known person id.
  const meOption = useMemo<DropdownOption | undefined>(() => {
    if (!selfPersonId) return undefined;
    return {
      value: ME_SENTINEL,
      label: 'Me',
      hint: personaUserName ?? undefined,
    };
  }, [selfPersonId, personaUserName]);

  // --- Fetch history (driven by filters / page / sort) ---
  const fetchHistory = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const payload = buildApiPayload(
          filters,
          page,
          sort.column,
          sort.dir,
          selfPersonId,
        );
        const res: CapacityHistoryResponse =
          await capacityApi.getCapacityHistory(payload);
        if (signal?.aborted) return;
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load history',
        );
        setItems([]);
        setTotal(0);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters, page, sort.column, sort.dir, selfPersonId],
  );

  useEffect(() => {
    // v5.2 W6 review-pass-2 fix (P2.A) — skip the history fetch when
    // the user isn't authorized; the redirect effect navigates them
    // away. Without this guard we'd fire one stray /api/capacity/history
    // call that 403s before the redirect.
    if (role && !isAuthorized) return;
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, [fetchHistory, role, isAuthorized]);

  // --- URL writers ---

  const updateFilter = (next: HistoryFilterValue) => {
    const u = writeFiltersToUrl(searchParams, next, fallback);
    setSearchParams(u, { replace: true });
  };

  const updateSort = (next: HistorySortColumn) => {
    const u = new URLSearchParams(searchParams);
    if (sort.column === next) {
      u.set(DIR_KEY, sort.dir === 'asc' ? 'desc' : 'asc');
    } else {
      u.set(SORT_KEY, next);
      u.set(DIR_KEY, next === 'timestamp' ? 'desc' : 'asc');
    }
    u.delete(PAGE_KEY);
    setSearchParams(u, { replace: true });
  };

  const updatePage = (nextPage: number) => {
    const u = new URLSearchParams(searchParams);
    if (nextPage <= 1) u.delete(PAGE_KEY);
    else u.set(PAGE_KEY, String(nextPage));
    setSearchParams(u, { replace: true });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // v5.2 W6 review fix (P1.3) — fire the §15 redirect from an effect so
  // every hook above runs on every render regardless of role.
  useEffect(() => {
    if (role && !isAuthorized) {
      navigate('/capacity', { replace: true });
    }
  }, [role, isAuthorized, navigate]);

  if (role && !isAuthorized) return null;

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Capacity History"
        subtitle="Chronological audit trail of capacity actions."
      />

      <HistoryFilterBar
        value={filters}
        onChange={updateFilter}
        userOptions={userOptions}
        ccOptions={ccOptions}
        projectOptions={projectOptions}
        hideCcFilter={isCcOwner}
        meOption={meOption}
        defaultValue={fallback}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} {total === 1 ? 'entry' : 'entries'}
          {totalPages > 1 && ` · page ${page} of ${totalPages}`}
        </span>
        {loading && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing…
          </span>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : (
        <HistoryTable
          items={items}
          showCostCenter={showCostCenter}
          sortColumn={sort.column}
          sortDir={sort.dir}
          onSortChange={updateSort}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={updatePage}
      />
    </div>
  );
}
