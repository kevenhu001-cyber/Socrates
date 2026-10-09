import { useEffect } from 'react';
import type { User } from '@socrates/contracts';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { api } from './runtime';
import { storage } from './storage';

interface AppLifecycleOptions {
  accountEpoch: { current: number };
  streamAbort: { current: AbortController | null };
  user: User | null;
  resetAccountState(): void;
  syncLibrary(): Promise<void>;
  loadProviders(): Promise<void>;
  resetProviders(): void;
}

/** Restores persisted identity, scopes async work to account changes, and refreshes account catalogs. */
export function useAppLifecycle({
  accountEpoch,
  streamAbort,
  user,
  resetAccountState,
  syncLibrary,
  loadProviders,
  resetProviders,
}: AppLifecycleOptions) {
  useEffect(() => {
    resetAccountState();
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id) resetAccountState();
    });
    void useSettingsStore.getState().hydrate(storage);
    void useAuthStore.getState().restore(storage, () => api.auth.me()).then(() => void syncLibrary());
    return () => {
      unsubscribe();
      accountEpoch.current++;
      streamAbort.current?.abort();
    };
  }, [accountEpoch, resetAccountState, streamAbort, syncLibrary]);

  useEffect(() => {
    if (!user || user.isGuest) {
      resetProviders();
      return;
    }
    void loadProviders();
  }, [loadProviders, resetProviders, user]);
}
