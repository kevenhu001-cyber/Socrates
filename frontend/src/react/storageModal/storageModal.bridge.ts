/**
 * Storage modal bridge — M2 single-bridge migration.
 *
 * `ui/storage.js` publishes through
 * `window.__socratesStorageBridge.publish(...)`. The factory owns the
 * snapshot/reducer/listener loop; this module adds the `publish` alias
 * and React hooks.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type { StorageBridge, StorageSnapshot } from './types';

declare global {
  interface Window {
    __socratesStorageBridge?: StorageBridge;
  }
}

type Action = Omit<StorageSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<StorageSnapshot, Action>({
  initial: { archived: [], open: false, revision: 0 },
  reducer: (state, action) => ({
    ...action,
    archived: Object.freeze([...action.archived]),
    revision: state.revision + 1,
  }),
});

const bridge: StorageBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as StorageBridge;

export function installStorageBridge(): StorageBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesStorageBridge) {
      window.__socratesStorageBridge = bridge;
    }
    return window.__socratesStorageBridge;
  }
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
