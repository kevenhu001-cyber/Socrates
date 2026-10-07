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
let generation = 0;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'signed-out',
  user: null,
  setUser: (user) => { generation++; set({ user, status: user ? 'signed-in' : 'signed-out' }); },
  setStatus: (status) => set({ status }),
  restore: async (storage, fetchMe) => {
    const epoch = ++generation;
    set({ user: null, status: 'restoring' });
    try {
      const user = await fetchMe();
      if (epoch !== generation) return;
      await storage.set(USER_KEY, JSON.stringify(user));
      if (epoch === generation) set({ user, status: 'signed-in' });
    } catch {
      // Cached identity alone is not proof of a valid credential.
      if (epoch === generation) set({ user: null, status: 'signed-out' });
    }
  },
  signOut: async (storage, doLogout) => {
    const epoch = ++generation;
    set({ user: null, status: 'signed-out' });
    // The injected client invalidates its generation synchronously and owns
    // credential rotation; local cleanup happens before waiting on logout.
    const logout = doLogout?.();
    await storage.remove(USER_KEY);
    if (!doLogout && epoch === generation) await storage.remove('socrates.auth.tokens');
    try { await logout; } catch { /* logout is best-effort; local state is already cleared */ }
  },
}));

export async function persistUser(storage: KeyValueStore, user: User): Promise<void> {
  await storage.set(USER_KEY, JSON.stringify(user));
}
