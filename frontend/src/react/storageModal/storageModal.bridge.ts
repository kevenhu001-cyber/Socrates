/** Module-owned archived-session state shared with the UI facade and React. */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { StorageBridge, StorageSnapshot } from './types';

type Action = Omit<StorageSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<StorageSnapshot, Action>({
  initial: { archived: [], open: false, revision: 0 },
  reducer: (_state, action) => ({
    ...action,
    archived: Object.freeze([...action.archived]),
  }),
});

const bridge: StorageBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as StorageBridge;

export function installStorageBridge(): StorageBridge {
  return bridge;
}

export function getStorageSnapshot(): StorageSnapshot {
  return installStorageBridge().getSnapshot();
}

export function subscribeToStorage(listener: () => void): () => void {
  return installStorageBridge().subscribe(listener);
}

export function useStorageSnapshot(): StorageSnapshot {
  return useBridge(factoryBridge);
}

export function useStorageDispatch() {
  const nav = getLegacyActions().navigation;
  const sessions = getLegacyActions().sessions;
  return {
    close: () => nav.closeStorageModal(),
    restore: (id: string) => sessions.restoreSession(id),
    purge: (id: string) => sessions.confirmPurgeSession(id),
  };
}
