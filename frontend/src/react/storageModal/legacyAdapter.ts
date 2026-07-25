import { useSyncExternalStore } from 'react';
import { getStorageSnapshot, subscribeToStorage } from './storageModalStore';
import type { StorageSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

export function useStorageSnapshot(): StorageSnapshot {
  return useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getStorageSnapshot);
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
