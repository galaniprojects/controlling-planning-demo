/**
 * useScopeQueryParams — v5.2 W2 Track A.
 *
 * Bidirectional sync between `CapacityScopeContext` state and
 * `?scope=…&group=…[&cc=…]` query params on `/capacity`.
 *
 * Behavior (per spec §2.2):
 *   - On mount: read URL → write into context (one-way restore so
 *     refresh / deep-links / back-navigation reproduce the workspace
 *     state).
 *   - On state change: replace-navigate the URL with the encoded
 *     values. We use `replace` (not `push`) so scope flicks during
 *     exploration don't pollute browser history.
 *   - The hook is route-scoped: it only writes the URL while the user
 *     is on the workspace route. Sibling routes (RequestsInbox,
 *     CapacityHistory) read the same context but don't own the URL.
 *
 * Defaults are *not* echoed to the URL — leaving `?scope=all_ccs&group=role`
 * out keeps URLs clean for the most common case.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  decodeScope,
  encodeScope,
  isValidGroupBy,
  useCapacityScope,
  type CapacityScope,
  type GroupBy,
} from '@/contexts/CapacityScopeContext';

const DEFAULT_SCOPE_PARAM = 'all_ccs';
const DEFAULT_GROUP_PARAM: GroupBy = 'role';

/**
 * Sync ScopeBar state with `?scope=…&group=…[&cc=…]`.
 *
 * Pass `enabled: false` to disable the URL writer (e.g. on routes
 * other than `/capacity` that share the same context but should not
 * mutate the URL).
 */
export function useScopeQueryParams({ enabled = true }: { enabled?: boolean } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { scope, groupBy, ccId, setScope, setGroupBy, setCcId } = useCapacityScope();
  const hasRestoredRef = useRef(false);
  // `isInitialized` gates the URL writer: we only mirror state → URL
  // after the restore step has committed. Without this gate, the writer
  // fires once with the *initial* (role-default) scope and wipes any
  // restored `?scope=…` from the URL on mount.
  const [isInitialized, setIsInitialized] = useState(false);

  // ---- Restore from URL on first mount ----
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const scopeParam = searchParams.get('scope');
    const groupParam = searchParams.get('group');
    const ccParam = searchParams.get('cc');

    const decoded: CapacityScope | null = decodeScope(scopeParam);
    if (decoded) {
      setScope(decoded);
    }
    if (isValidGroupBy(groupParam)) {
      setGroupBy(groupParam);
    }
    if (ccParam) {
      setCcId(ccParam);
    }
    // React 18 batches the setScope/setGroupBy/setCcId/setIsInitialized
    // calls into a single commit, so by the time the writer effect
    // re-runs (because `isInitialized` changed) the restored scope is
    // already in state.
    setIsInitialized(true);
    // Intentionally a one-shot effect (`hasRestoredRef`); we don't want
    // URL → state syncing to fight the user's pill clicks afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Push state to URL ----
  useEffect(() => {
    if (!enabled) return;
    if (!isInitialized) return;

    const next = new URLSearchParams(searchParams);

    const scopeStr = encodeScope(scope);
    if (scopeStr === DEFAULT_SCOPE_PARAM) {
      next.delete('scope');
    } else {
      next.set('scope', scopeStr);
    }

    if (groupBy === DEFAULT_GROUP_PARAM) {
      next.delete('group');
    } else {
      next.set('group', groupBy);
    }

    if (scope.kind === 'my_cc' && ccId) {
      next.set('cc', ccId);
    } else {
      next.delete('cc');
    }

    // Avoid noisy navigations when nothing changed.
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // searchParams is intentionally omitted — including it causes
    // re-runs after every URL update (we wrote it ourselves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isInitialized, scope, groupBy, ccId]);
}
