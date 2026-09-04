/**
 * createDomainStore — Zustand-backed domain state factory (M1 of the
 * LobeHub-alignment plan, ADR 0001).
 *
 * Why this exists
 *  - `src/state/bridges.ts` has carried the six domain namespaces
 *    (session/kb/search/call/ui/exam) on hand-rolled snapshot bridges.
 *    The semantics are good (RAF-coalesced commits, monotonic
 *    `revision` invalidation signal, frozen snapshots) but the plumbing
 *    is private, so React islands can only consume them through
 *    `useSyncExternalStore` + ad-hoc reader functions.
 *  - This factory reproduces the exact bridge contract
 *    (`ImmutableBridge`) while making a Zustand 5 vanilla store the
 *    snapshot holder. That gives every domain store:
 *      - `useXxxStore(selector)` typed hooks (the LobeHub
 *        `src/store/` slice pattern) for new/migrating React code,
 *      - standard `store.subscribe`/`store.getState` interop,
 *      - the same dispatch/flush/revision semantics so the legacy
 *        `stateStore` facade, `window.stateStore`, e2e mocks and the
 *        existing unit tests keep working unchanged.
 *
 * Behavior (must match `createImmutableBridge` bit for bit)
 *  - Snapshots are shallow-frozen; nested objects/arrays stay mutable
 *    for legacy in-place mutation patterns.
 *  - `dispatch` queues actions; the queued batch is applied by a RAF
 *    flush. Reducer output identical to the previous snapshot is a
 *    no-op (no revision bump, no notification).
 *  - `revision` increments once per flush that changed state.
 *  - Reducer errors preserve the previous snapshot.
 *  - `__resetForTests` restores the initial snapshot and clears the
 *    queue.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

export interface RevisionedSnapshot {
  revision: number;
}

export interface DomainBridge<Snapshot extends RevisionedSnapshot, Action> {
  getSnapshot(): Snapshot;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  flush(): void;
  __resetForTests(): void;
}

export interface DomainStore<Snapshot extends RevisionedSnapshot, Action> {
  /** ImmutableBridge-compatible facade (dispatch/flush/subscribe). */
  bridge: DomainBridge<Snapshot, Action>;
  /** Zustand vanilla store — snapshot holder + subscription plumbing. */
  store: StoreApi<Snapshot>;
}

export interface CreateDomainStoreOptions<Snapshot extends RevisionedSnapshot, Action> {
  initial: Snapshot;
  reducer: (
    state: Snapshot,
    action: Action,
  ) => Snapshot | Omit<Snapshot, 'revision'>;
}

type Listener = () => void;

function shallowFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value as unknown as Record<string, unknown>);
  return value;
}

export function createDomainStore<Snapshot extends RevisionedSnapshot, Action>(
  options: CreateDomainStoreOptions<Snapshot, Action>,
): DomainStore<Snapshot, Action> {
  const { initial, reducer } = options;

  const start: Snapshot = shallowFreeze({ ...initial });

  /* Zustand vanilla store holds the committed snapshot. `setState` with
     a replacement object notifies subscribers; we never use updater
     functions inside the store itself — the reducer owns transitions. */
  const store = createStore<Snapshot>(() => start);

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
      snapshot = shallowFreeze({
        ...next,
        revision: snapshot.revision + 1,
      });
      /* Replace (not merge) so `store.getState()` stays reference-equal
         with `bridge.getSnapshot()` — the facade and React readers rely
         on one canonical snapshot object. */
      store.setState(snapshot, true);
    } catch (error) {
      /* Reducer errors leave the previous snapshot in place so
         subscribers always see consistent state. Matches the
         createImmutableBridge behavior this factory replaces. */
      // eslint-disable-next-line no-console
      console.error('[domainStore] reducer threw, snapshot preserved', error);
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

  const bridge: DomainBridge<Snapshot, Action> = {
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
      store.setState(start, true);
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

  return { bridge, store };
}
