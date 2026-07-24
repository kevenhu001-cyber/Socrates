import { useSyncExternalStore } from 'react';
import { getStorageSnapshot, subscribeToStorage } from './storageModalStore';
import type { StorageSnapshot } from './types';

export function useStorageSnapshot(): StorageSnapshot {
  return useSyncExternalStore(subscribeToStorage, getStorageSnapshot, getStorageSnapshot);
}

export function useStorageDispatch() {
  return {
    close: () => { if (typeof window.closeStorageModal === 'function') window.closeStorageModal(); },
    restore: (id: string) => { if (typeof window.restoreSession === 'function') window.restoreSession(id); },
    purge: (id: string) => { if (typeof window.confirmPurgeSession === 'function') window.confirmPurgeSession(id); },
  };
}
