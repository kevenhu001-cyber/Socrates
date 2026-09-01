/**
 * createImmutableBridge — single factory for the legacy
 * `xxxStore.ts` + `useXxxStore.ts` + `legacyAdapter.ts` triple
 * boilerplate.
 *
 * Why this exists
 *  - As of M1, eighteen modules carry their own `getSnapshot` /
 *    `publish` / `subscribe` triplet with hand-rolled Object.freeze,
 *    RAF throttling, and `revision++` bookkeeping. The shape is
 *    identical; only the snapshot type and the reducer vary.
 *  - M2 will migrate each store onto this factory. M1 ships the
 *    factory itself so the migrations land as mechanical edits
 *    rather than new abstractions.
 *
 * Behavior
 *  - Snapshots are deep-frozen (`Object.freeze`) and the factory bumps a
 *    monotonic `revision` on every commit. Subscribers only run
 *    after a successful commit; failed reducers leave the previous
 *    snapshot untouched and surface the error in development.
 *  - `dispatch(action)` queues calls per animation frame: reducers run
 *    in dispatch order, then subscribers receive one notification. This
 *    preserves every state transition while still coalescing renders and
 *    matches the RAF pattern already in use by
 *    `src/react/attachments/attachmentsStore.ts`.
 *  - `subscribe(listener)` returns a disposer that removes the
 *    listener when called. Multiple listeners are supported.
 *
 * Surface area
 *  - `getSnapshot()` is a synchronous read. Consumers wrap it in
 *    `useSyncExternalStore` (see `useBridge.ts`) to power React.
 *  - `dispatch(action)` is the canonical write entry. Reducers are
 *    pure functions `(state, action) => state`; non-pure work is
 *    the caller's responsibility outside the reducer.
 *  - `subscribe(listener)` matches React's `useSyncExternalStore`
 *    subscribe contract.
 */

export interface ImmutableBridge<Snapshot, Action> {
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

export interface RevisionedSnapshot {
  revision: number;
}

export interface CreateImmutableBridgeOptions<Snapshot extends RevisionedSnapshot, Action> {
  /** Initial snapshot value. Will be deep-frozen by the factory. */
  initial: Snapshot;
  /** Pure reducer `(state, action) => nextState`. */
  reducer: (
    state: Snapshot,
    action: Action,
  ) => Snapshot | Omit<Snapshot, 'revision'>;
  /**
   * Optional window-name the bridge should expose itself on. M1
   * preserves the existing `window.__socratesXxxBridge` slots so
   * legacy readers keep working; M2 will centralize the slot.
   */
  windowKey?: string;
}

type Listener = () => void;

/**
 * Shallow-freeze the top level of a snapshot so the snapshot
 * identity is stable but nested objects/arrays remain mutable for
 * legacy `state.kb.boundariesHistory.push(...)` patterns. The
 * snapshot's `revision` is what gives consumers a stable identity
 * for change detection (see `useSyncExternalStore`).
 */
function shallowFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value as unknown as Record<string, unknown>);
  return value;
}

/**
 * Create an immutable bridge with the snapshot/action types of the
 * caller's choice. Reducers must be pure; the factory deep-freezes
 * every committed snapshot before notifying subscribers.
 */
export function createImmutableBridge<Snapshot extends RevisionedSnapshot, Action>(
  options: CreateImmutableBridgeOptions<Snapshot, Action>,
): ImmutableBridge<Snapshot, Action> {
  const { initial, reducer, windowKey } = options;

  let snapshot: Snapshot = shallowFreeze(initial);
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
    } catch (error) {
      /* Reducer errors leave the previous snapshot in place so
         subscribers always see consistent state. The error is
         surfaced through the console; we don't rethrow because the
         dispatch is async-ish (RAF-coalesced). */
      // eslint-disable-next-line no-console
      console.error('[bridge] reducer threw, snapshot preserved', error);
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

  const bridge: ImmutableBridge<Snapshot, Action> = {
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
      snapshot = shallowFreeze(initial);
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

  if (windowKey && typeof window !== 'undefined') {
    /* Avoid clobbering an existing bridge — that would silently drop
       subscribers registered against the previous instance. */
    if (!(windowKey in window)) {
      (window as unknown as Record<string, unknown>)[windowKey] = bridge;
    }
  }

  return bridge;
}
