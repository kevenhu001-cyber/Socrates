import type { User } from '@socrates/contracts';
import type { KeyValueStore } from '@socrates/platform';
import { create } from 'zustand';

/**
 * @socrates/auth — DOM-free auth session state for the Universal App.
 *
 * Storage, networking, and navigation stay outside: callers inject a
 * `KeyValueStore` (SecureStore on native, localStorage adapter on web,
 * memory in tests) plus thin `fetchMe`/`doLogout` delegates wired to
 * `@socrates/api`. No document/window/localStorage/react-dom here —
 * enforced by scripts/check-packages-dom.mjs.
 */

export type AuthStatus = 'signed-out' | 'restoring' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  setUser(user: User | null): void;
  setStatus(status: AuthStatus): void;
  restore(storage: KeyValueStore, fetchMe: () => Promise<User>): Promise<void>;
  signOut(storage: KeyValueStore, doLogout?: () => Promise<void>): Promise<void>;
}

const USER_KEY = 'socrates.auth.user';

export const useAuthStore = create<AuthState>((set) => ({
  status: 'signed-out',
  user: null,
  setUser: (user) => set({ user, status: user ? 'signed-in' : 'signed-out' }),
  setStatus: (status) => set({ status }),
  restore: async (storage, fetchMe) => {
    set({ status: 'restoring' });
    try {
      const cached = await storage.get(USER_KEY);
      if (cached) {
        try {
          const user = JSON.parse(cached) as User;
          set({ user, status: 'signed-in' });
          return;
        } catch { /* fall through to fetchMe */ }
      }
      const user = await fetchMe();
      await storage.set(USER_KEY, JSON.stringify(user));
      set({ user, status: 'signed-in' });
    } catch {
      set({ user: null, status: 'signed-out' });
    }
  },
  signOut: async (storage, doLogout) => {
    try { await doLogout?.(); } catch { /* logout is best-effort */ }
    await storage.remove(USER_KEY);
    await storage.remove('socrates.auth.tokens');
    set({ user: null, status: 'signed-out' });
  },
}));

export async function persistUser(storage: KeyValueStore, user: User): Promise<void> {
  await storage.set(USER_KEY, JSON.stringify(user));
}
