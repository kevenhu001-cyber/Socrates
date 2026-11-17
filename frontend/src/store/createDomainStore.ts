/**
 * Domain stores — Zustand-backed snapshots with the bridge contract.
 *
 * This factory no longer owns a second copy of the RAF/revision/freeze
 * logic. `store/bridge.ts` is the single implementation; this module adds
 * the one thing domain stores need on top of it: a read-only Zustand
 * vanilla store whose state is the exact committed bridge snapshot.
 *
 * New React code uses the hooks in `store/index.ts`. Legacy module stores
 * use `createImmutableBridge` from the same bridge implementation.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { createBridge, type Bridge, type RevisionedSnapshot } from './bridge.ts';

/** Read-only Zustand API: domain actions are the sole write entry. */
export type DomainStoreReader<Snapshot> = Pick<
  StoreApi<Snapshot>,
  'getState' | 'getInitialState' | 'subscribe'
>;

export interface DomainStore<Snapshot extends RevisionedSnapshot, Action> {
  /** Bridge-compatible facade (dispatch/flush/subscribe). */
  bridge: Bridge<Snapshot, Action>;
  /** Zustand vanilla store — snapshot holder + subscription plumbing. */
  store: DomainStoreReader<Snapshot>;
}

export interface CreateDomainStoreOptions<Snapshot extends RevisionedSnapshot, Action> {
  initial: Snapshot;
  reducer: (state: Snapshot, action: Action) => Snapshot | Omit<Snapshot, 'revision'>;
}

export function createDomainStore<Snapshot extends RevisionedSnapshot, Action>(
  options: CreateDomainStoreOptions<Snapshot, Action>,
): DomainStore<Snapshot, Action> {
  const bridge = createBridge({ ...options, freeze: 'deep' });
  const store = createStore<Snapshot>(() => bridge.getSnapshot());

  /* Mirror every commit, including `__resetForTests`, before other bridge
     subscribers run. This keeps `store.getState()` reference-equal with
     `bridge.getSnapshot()` for React readers. */
  bridge.subscribe(() => {
    store.setState(bridge.getSnapshot(), true);
  });

  const reader: DomainStoreReader<Snapshot> = Object.freeze({
    getState: store.getState,
    getInitialState: store.getInitialState,
    subscribe: store.subscribe,
  });
  return { bridge, store: reader };
}
