/**
 * useDirtyBuffer — buffered edit state with explicit Save semantics.
 *
 * Part of the Define-page redesign. Replaces the previous app-wide
 * autosave-on-blur (300 ms debounce) pattern with an explicit Save
 * model: edits accumulate in a local buffer until the consumer calls
 * `save()`, at which point the buffer is flushed to the supplied
 * persistence function and the canonical value is refreshed.
 *
 * The hook is intentionally generic so it can back any of the Define
 * tabs (Identity, Tech Navigator, Financials, Approval & Milestones)
 * and the post-sweep autosave-removal targets (Workbench forecast
 * grid, External Costs, Admin grids, intake/CR editable grids). The
 * progress tracker (`modules/workbench/progress/*`) is the only
 * explicit exemption from the sweep and continues to autosave.
 *
 * --- Contract ---
 *
 * Input:
 *   initial            — the canonical value loaded from the server (or
 *                        a sentinel like `null` if not yet loaded).
 *   onSave(value)      — async persistence call. The returned value, if
 *                        provided, becomes the new canonical baseline;
 *                        otherwise the dirty value is promoted to
 *                        baseline on success.
 *   options.equals     — optional custom equality (defaults to a
 *                        shallow-object compare for object payloads
 *                        and Object.is for primitives).
 *
 * Output:
 *   value              — the working value reflecting buffered edits.
 *   setValue(updater)  — accepts either a next value or an updater
 *                        function. Marks the buffer dirty if the new
 *                        value differs from the baseline.
 *   patch(partial)     — convenience for object payloads: shallow
 *                        merges `partial` into the current value.
 *   isDirty            — true when buffered edits differ from the
 *                        loaded baseline.
 *   save()             — flushes the buffer through `onSave` and
 *                        promotes the result (or the dirty value) to
 *                        the new baseline.
 *   reset()            — discards buffered edits, restoring baseline.
 *   reload(next)       — replaces the baseline (e.g. after the
 *                        consumer re-fetches). Buffered edits are
 *                        discarded.
 *   saving             — true while `onSave` is in flight.
 *   error              — last save error message, or null.
 *
 * --- Per-tab scope ---
 *
 * Each Define tab should own its own `useDirtyBuffer` instance — a
 * global buffer would bleed dirty state across tabs and break the
 * "Save this tab" mental model (Risk #4 in the plan). Tab labels can
 * derive their dirty pip from this hook's `isDirty`.
 *
 * --- Usage examples ---
 *
 * Object payload (Identity tab):
 *   const identity = useDirtyBuffer<IdentityPayload | null>({
 *     initial: loaded,
 *     onSave: (value) => projectsApi.updateIdentity(projectId, value!),
 *   });
 *   <Input value={identity.value?.name ?? ''}
 *          onChange={(e) => identity.patch({ name: e.target.value })} />
 *   <Button disabled={!identity.isDirty || identity.saving}
 *           onClick={identity.save}>Save</Button>
 *
 * Primitive (single field):
 *   const note = useDirtyBuffer<string>({
 *     initial: serverNote,
 *     onSave: (v) => notesApi.save(v),
 *   });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDirtyBufferOptions<T> {
  /** Initial / baseline value loaded from the server. */
  initial: T;
  /**
   * Persists the current dirty value. May return the canonical
   * server-side value, which then becomes the new baseline. If it
   * returns `undefined`, the dirty value itself becomes the baseline.
   */
  onSave: (value: T) => Promise<T | void>;
  /**
   * Optional custom equality. Defaults to:
   *   - `Object.is` for primitives / nulls
   *   - shallow key-equality for plain objects
   * Provide a custom comparator for deep / nested payloads.
   */
  equals?: (a: T, b: T) => boolean;
}

export interface UseDirtyBufferResult<T> {
  /** Working value reflecting buffered edits. */
  value: T;
  /** Replace the value (mirrors React's setState signature). */
  setValue: (updater: T | ((prev: T) => T)) => void;
  /**
   * Shallow-merge a partial into an object-shaped value. No-op when
   * the buffer holds a primitive — use `setValue` instead.
   */
  patch: (partial: Partial<T>) => void;
  /** True when buffered edits differ from baseline. */
  isDirty: boolean;
  /**
   * Persists the buffer. Resolves once `onSave` succeeds and the
   * baseline has been promoted. Throws on failure (the error is also
   * surfaced via `error`).
   */
  save: () => Promise<void>;
  /** Discards buffered edits, restoring baseline. */
  reset: () => void;
  /**
   * Replaces the baseline with `next` and discards buffered edits.
   * Use after the consumer re-fetches the canonical value from the
   * server (e.g. on a sibling-tab Save that may have changed shared
   * fields).
   */
  reload: (next: T) => void;
  /** True while `onSave` is in flight. */
  saving: boolean;
  /** Last save error message, or null. */
  error: string | null;
}

function defaultEquals<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object'
  ) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!Object.is(aObj[k], bObj[k])) return false;
    }
    return true;
  }
  return false;
}

export function useDirtyBuffer<T>({
  initial,
  onSave,
  equals = defaultEquals,
}: UseDirtyBufferOptions<T>): UseDirtyBufferResult<T> {
  // The canonical baseline (what the server has).
  const [baseline, setBaseline] = useState<T>(initial);
  // The working value (what the user is editing).
  const [value, setValueState] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep `equals` stable so callers can pass an inline lambda without
  // triggering an effect re-run loop.
  const equalsRef = useRef(equals);
  equalsRef.current = equals;

  // Sync when `initial` actually changes (compared via the supplied
  // equality function). The structural compare is critical because
  // many consumers project the canonical value through a mapper
  // (`projectToBuffer(p)`) which produces a new object reference on
  // every render; a strict `Object.is` check would loop forever.
  const initialRef = useRef(initial);
  useEffect(() => {
    if (!equalsRef.current(initialRef.current, initial)) {
      initialRef.current = initial;
      setBaseline(initial);
      setValueState(initial);
      setError(null);
    }
  }, [initial]);

  const isDirty = !equalsRef.current(value, baseline);

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueState((prev) =>
        typeof updater === 'function'
          ? (updater as (prev: T) => T)(prev)
          : updater,
      );
    },
    [],
  );

  const patch = useCallback((partial: Partial<T>) => {
    setValueState((prev) => {
      if (prev === null || typeof prev !== 'object') return prev;
      return { ...(prev as object), ...partial } as T;
    });
  }, []);

  const reset = useCallback(() => {
    setValueState(baseline);
    setError(null);
  }, [baseline]);

  const reload = useCallback((next: T) => {
    initialRef.current = next;
    setBaseline(next);
    setValueState(next);
    setError(null);
  }, []);

  // Synchronous in-flight guard. The `saving` state cannot be relied on
  // here because React batches state updates — two rapid `save()` calls
  // in the same tick (e.g. a fast double-click) would both see `saving`
  // as false. The ref flips synchronously and is cleared in `finally`.
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(value);
      const promoted = (result === undefined ? value : result) as T;
      initialRef.current = promoted;
      setBaseline(promoted);
      setValueState(promoted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      throw e;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onSave, value]);

  return {
    value,
    setValue,
    patch,
    isDirty,
    save,
    reset,
    reload,
    saving,
    error,
  };
}
