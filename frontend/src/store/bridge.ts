/**
 * The single state-bridge implementation for the SPA.
 *
 * A bridge owns one frozen snapshot and one pure reducer. It coalesces
 * dispatches into one commit per animation frame, bumps a monotonic
 * `revision` on every real change, and lets React subscribe through
 * `useSyncExternalStore` (see `store/useBridge.ts`).
 *
 * Two freeze modes exist because the app is mid-migration:
 *
 * - `deep` (new domain stores) freezes the whole plain-data snapshot, so a
 *   reducer cannot mutate committed state by accident.
 * - `shallow` (legacy module stores) freezes only the top-level snapshot,
 *   preserving the historical `state.kb.boundariesHistory.push(...)`
 *   compatibility path. New code must not rely on nested writes.
 *
 * This file is the only factory. `createImmutableBridge` is a naming
 * compatibility entry for legacy stores, not a second implementation.
 */

import { reportSwallow } from '../util/reportSwallow.ts';

export interface RevisionedSnapshot {
  revision: number;
}

export interface Bridge<Snapshot, Action> {
  /** Synchronous read of the current frozen snapshot. */
  getSnapshot(): Snapshot;
  /** Apply an action through the reducer; commits via RAF. */
  dispatch(action: Action): void;
  /** Subscribe to commit notifications; returns a disposer. */
  subscribe(listener: () => void): () => void;
  /** Manually flush pending commits (bypasses RAF). */
  flush(): void;
  /** Test-only hook to reset state back to the initial snapshot. */
  __resetForTests(): void;
}

export type BridgeFreezeMode = 'shallow' | 'deep';

export interface CreateBridgeOptions<Snapshot extends RevisionedSnapshot, Action> {
  /** Initial snapshot value. */
  initial: Snapshot;
  /** Pure reducer `(state, action) => nextState`. */
  reducer: (state: Snapshot, action: Action) => Snapshot | Omit<Snapshot, 'revision'>;
  /** Defaults to `deep`; legacy module stores opt into `shallow`. */
  freeze?: BridgeFreezeMode;
}

type Listener = () => void;

/**
 * Shallow-freeze the top level of a snapshot. Nested values remain mutable
 * only for legacy `state.kb.boundariesHistory.push(...)` patterns; those
 * mutations bypass revision bumps and subscriber notifications. New code
 * must treat nested values as immutable and dispatch replacement actions.
 */
function shallowFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value as unknown as Record<string, unknown>);
  return value;
}

/** Deep-freeze plain data; runtime buffers and class instances stay outside. */
function deepFreeze<T>(value: T, frozen = new WeakSet<object>()): T {
  const visiting = new WeakSet<object>();
  function visit(item: unknown): void {
    if (!item || typeof item !== 'object' || frozen.has(item) || visiting.has(item)) return;
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) return;
    visiting.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    frozen.add(item);
  }
  visit(value);
  return value;
}

export function createBridge<Snapshot extends RevisionedSnapshot, Action>(
  options: CreateBridgeOptions<Snapshot, Action>,
): Bridge<Snapshot, Action> {
  const { initial, reducer, freeze = 'deep' } = options;
  const frozenSubtrees = new WeakSet<object>();
  const freezeSnapshot =
    freeze === 'deep' ? <T>(value: T): T => deepFreeze(value, frozenSubtrees) : shallowFreeze;
  /* Deep mode clones the initial object so the caller's literal stays
     usable; shallow mode keeps the historical identity for tests and
     legacy code that compares against the initial snapshot. */
  const start: Snapshot =
    freeze === 'deep' ? freezeSnapshot({ ...initial }) : freezeSnapshot(initial);
  let snapshot: Snapshot = start;
  const listeners = new Set<Listener>();

  let pendingActions: Action[] = [];
  let rafHandle = 0;

  const flush = (): void => {
    rafHandle = 0;
    if (pendingActions.length === 0) return;
    const actions = pendingActions;
    pendingActions = [];
    try {
      let next = snapshot;
      let changed = false;
      for (const action of actions) {
        const reduced = reducer(next, action);
        if (reduced === next) continue;
        next = {
          ...reduced,
          revision: next.revision,
        } as Snapshot;
        changed = true;
      }
      if (!changed) return;
      snapshot = freezeSnapshot({
        ...next,
        revision: snapshot.revision + 1,
      });
    } catch (error) {
      /* Reducer errors leave the previous snapshot in place so
         subscribers always see consistent state. The error is
         surfaced through the console; we don't rethrow because the
         dispatch is async-ish (RAF-coalesced). */
      console.error('[state] reducer threw, snapshot preserved', error);
      reportSwallow(error, 'store/reducer', 'invariant');
      return;
    }
    listeners.forEach((listener) => listener());
  };

  const scheduleFlush = (): void => {
    if (rafHandle !== 0) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      rafHandle = -1;
      Promise.resolve().then(flush);
      return;
    }
    rafHandle = window.requestAnimationFrame(flush);
  };

  return {
    getSnapshot: () => snapshot,
    dispatch(action) {
      pendingActions.push(action);
      scheduleFlush();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush() {
      flush();
    },
    __resetForTests() {
      snapshot = start;
      pendingActions = [];
      if (rafHandle !== 0) {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(rafHandle);
        }
        rafHandle = 0;
      }
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Legacy naming entry for module-level stores that rely on shallow freeze.
 * New code should call `createBridge` and choose a freeze mode explicitly.
 */
export function createImmutableBridge<Snapshot extends RevisionedSnapshot, Action>(
  options: Omit<CreateBridgeOptions<Snapshot, Action>, 'freeze'>,
): Bridge<Snapshot, Action> {
  return createBridge({ ...options, freeze: 'shallow' });
}
